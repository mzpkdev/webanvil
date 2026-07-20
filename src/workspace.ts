import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

/** A workspace package: its directory and the parts of its package.json vial reads. */
export type WorkspacePackage = { dir: string; name: string; scripts: Record<string, string> }

/** The nearest ancestor of `from` (inclusive) whose package.json declares `workspaces`, or
 *  undefined when `from` is not inside a workspace. Defines the boundary for config walk-up and
 *  package discovery. */
export const findWorkspaceRoot = (from: string = process.cwd()): string | undefined => {
    let dir = path.resolve(from)
    for (;;) {
        const manifest = path.join(dir, "package.json")
        if (existsSync(manifest)) {
            try {
                if ((JSON.parse(readFileSync(manifest, "utf8")) as { workspaces?: unknown }).workspaces) {
                    return dir
                }
            } catch {
                // unreadable or invalid manifest: keep walking up
            }
        }
        const parent = path.dirname(dir)
        if (parent === dir) {
            return undefined
        }
        dir = parent
    }
}

/** The `workspaces` patterns from a manifest, normalized to an array (supports the bun/npm array
 *  form and the `{ packages: [...] }` object form). */
const workspacePatterns = (manifest: string): string[] => {
    const field = (JSON.parse(readFileSync(manifest, "utf8")) as { workspaces?: string[] | { packages?: string[] } })
        .workspaces
    if (Array.isArray(field)) {
        return field
    }
    return field?.packages ?? []
}

/** Expand one workspaces pattern (relative to `root`) to existing directories. Handles a literal
 *  path and a single trailing "*" segment (e.g. "projects/*"); richer globs are skipped. */
const expandPattern = (root: string, pattern: string): string[] => {
    if (pattern.endsWith("/*")) {
        const baseAbs = path.join(root, pattern.slice(0, -2))
        if (!existsSync(baseAbs)) {
            return []
        }
        return readdirSync(baseAbs, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => path.join(baseAbs, entry.name))
    }
    const abs = path.join(root, pattern)
    return existsSync(abs) ? [abs] : []
}

/** Every workspace package under `root` that has a package.json, read once. */
export const workspacePackages = (root: string = process.cwd()): WorkspacePackage[] => {
    const manifest = path.join(root, "package.json")
    if (!existsSync(manifest)) {
        return []
    }
    const packages: WorkspacePackage[] = []
    for (const pattern of workspacePatterns(manifest)) {
        for (const dir of expandPattern(root, pattern)) {
            const pkg = path.join(dir, "package.json")
            if (!existsSync(pkg)) {
                continue
            }
            const parsed = JSON.parse(readFileSync(pkg, "utf8")) as { name?: string; scripts?: Record<string, string> }
            packages.push({ dir, name: parsed.name ?? path.basename(dir), scripts: parsed.scripts ?? {} })
        }
    }
    return packages
}
