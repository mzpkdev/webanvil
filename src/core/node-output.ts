import { rename, rm } from "node:fs/promises"
import { dirname, relative, resolve } from "pathe"

import { type Plugin as RolldownPlugin, rolldown } from "rolldown"
import { isolatedDeclarationPlugin } from "rolldown/experimental"
import { glob } from "tinyglobby"

type NodeOutputOptions = {
    inputs: Record<string, string>
    minify?: boolean
    outDir: string
    plugins?: RolldownPlugin[]
    sourcemap?: boolean
    target?: "node20" | "browser" | "neutral"
}

type BundleOutputOptions = Omit<NodeOutputOptions, "inputs" | "plugins"> & {
    declaration?: boolean
    entry: string
    entries?: Record<string, string>
    formats?: Array<"esm" | "cjs">
    plugins?: RolldownPlugin[]
}

const sourceExtensions = [".cts", ".mts", ".tsx", ".jsx", ".ts", ".js"]

const withoutExtension = (path: string): string => {
    const extension = sourceExtensions.find((candidate) => path.endsWith(candidate))
    return extension === undefined ? path : path.slice(0, -extension.length)
}

export const applicationInputs = async (rootDir: string): Promise<Record<string, string>> => {
    const files = await glob("**/*.{ts,tsx,js,jsx,mts,cts}", {
        absolute: true,
        cwd: rootDir,
        ignore: ["**/*.d.ts", "**/*.d.mts", "**/*.d.cts"]
    })

    return Object.fromEntries(files.map((file) => [withoutExtension(relative(rootDir, file)), file]))
}

export const sourceRoot = (entry: string, cwd = process.cwd()): string => dirname(resolve(cwd, entry))

export const writeApplicationOutput = async ({
    inputs,
    minify,
    outDir,
    plugins = [],
    sourcemap,
    target = "node20"
}: NodeOutputOptions): Promise<void> => {
    if (Object.keys(inputs).length === 0) throw new Error("No application source files found")

    await rm(outDir, { force: true, recursive: true })

    const bundle = await rolldown({
        input: inputs,
        plugins,
        platform: target === "node20" ? "node" : target,
        ...(target === "node20" ? { transform: { target } } : {}),
        external: (id) => id.startsWith("node:") || (!id.startsWith(".") && !id.startsWith("/"))
    })

    try {
        await bundle.write({
            cleanDir: false,
            dir: outDir,
            entryFileNames: "[name].js",
            format: "es",
            minify,
            sourcemap
        })
    } finally {
        await bundle.close()
    }
}

const entryName = (subpath: string): string => (subpath === "." ? "index" : subpath.slice(2))

const defaultEntryName = (entry: string, cwd: string): string =>
    withoutExtension(relative(cwd, resolve(cwd, entry))).replace(/^src\//, "")

export const bundledInputs = (cwd: string, entry: string, entries?: Record<string, string>): Record<string, string> => {
    if (entries !== undefined) {
        return Object.fromEntries(
            Object.entries(entries).map(([subpath, source]) => [entryName(subpath), resolve(cwd, source)])
        )
    }

    return { [defaultEntryName(entry, cwd)]: resolve(cwd, entry) }
}

const moveDeclarations = async (outDir: string): Promise<void> => {
    const sourceDeclarations = resolve(outDir, "src")
    const files = await glob("**/*.d.{ts,mts,cts}", { absolute: true, cwd: sourceDeclarations })

    await Promise.all(files.map((file) => rename(file, resolve(outDir, relative(sourceDeclarations, file)))))
    await rm(sourceDeclarations, { force: true, recursive: true })
}

export const writeBundledOutput = async ({
    declaration,
    entry,
    entries,
    formats = ["esm"],
    minify,
    outDir,
    plugins = [],
    sourcemap,
    target = "node20"
}: BundleOutputOptions): Promise<void> => {
    const cwd = process.cwd()
    const inputs = bundledInputs(cwd, entry, entries)
    const emitDeclarations = declaration === true

    await rm(outDir, { force: true, recursive: true })

    const bundle = await rolldown({
        input: inputs,
        plugins: [...plugins, ...(emitDeclarations ? [isolatedDeclarationPlugin()] : [])],
        platform: target === "node20" ? "node" : target,
        ...(target === "node20" ? { transform: { target } } : {}),
        external: (id) => id.startsWith("node:") || (!id.startsWith(".") && !id.startsWith("/"))
    })

    try {
        for (const format of formats) {
            await bundle.write({
                cleanDir: false,
                dir: outDir,
                entryFileNames: format === "esm" ? "[name].js" : "[name].cjs",
                format: format === "esm" ? "es" : "cjs",
                minify,
                sourcemap
            })
        }
    } finally {
        await bundle.close()
    }

    if (emitDeclarations) await moveDeclarations(outDir)
}
