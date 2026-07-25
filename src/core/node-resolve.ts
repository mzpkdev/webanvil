import { isBuiltin } from "node:module"

import { isAbsolute, relative } from "pathe"
import type { Plugin as RolldownPlugin, ResolvedId } from "rolldown"

const dependencyStoreSegments = [
    "/node_modules/",
    "/.pnpm/",
    "/.yarn/cache/",
    "/.yarn/berry/cache/",
    "/.bun/install/cache/"
]

const cleanId = (id: string): string => id.replaceAll("\\", "/").split(/[?#]/, 1)[0]!

export const isInstalledPackagePath = (id: string, cwd = process.cwd()): boolean => {
    const path = cleanId(id)
    if (dependencyStoreSegments.some((segment) => path.includes(segment))) return true

    // pnpm and Bun may resolve a package from a store outside the active
    // project without retaining a node_modules segment in the final id.
    const projectRelative = relative(cwd, path)
    return (
        (projectRelative === ".." || projectRelative.startsWith("../")) &&
        (path.includes("/pnpm/store/") || path.includes("/bun/install/"))
    )
}

const cacheKey = (source: string, importer: string | undefined): string => `${importer ?? ""}\0${source}`

export const projectExternalPlugin = (cwd = process.cwd()): RolldownPlugin => {
    const resolutionCache = new Map<string, Promise<ResolvedId | null>>()

    return {
        name: "webanvil-project-externals",
        buildStart() {
            resolutionCache.clear()
        },
        resolveId: {
            order: "pre",
            async handler(source, importer, options) {
                if (isBuiltin(source)) return { id: source, external: true }
                if (source.startsWith(".") || isAbsolute(source) || source.startsWith("\0")) return null

                const key = cacheKey(source, importer)
                let pending = resolutionCache.get(key)
                if (pending === undefined) {
                    // This plugin runs first so delegated resolution observes
                    // native aliases and user plugins before deciding whether
                    // their final target belongs to an installed dependency.
                    pending = this.resolve(source, importer, { ...options, skipSelf: true })
                    resolutionCache.set(key, pending)
                }

                const resolved = await pending
                if (resolved === null) {
                    this.error(`Could not resolve "${source}"${importer === undefined ? "" : ` from ${importer}`}`)
                }
                if (resolved.external) return resolved
                return isInstalledPackagePath(resolved.id, cwd) ? { id: source, external: true } : resolved
            }
        }
    }
}
