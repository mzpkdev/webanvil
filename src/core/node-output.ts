import { rename, rmdir } from "node:fs/promises"
import { dirname, relative, resolve } from "pathe"

import {
    type InputOptions,
    type OutputOptions,
    type Plugin as RolldownPlugin,
    type RolldownBuild,
    rolldown
} from "rolldown"
import { isolatedDeclarationPlugin } from "rolldown/experimental"
import { glob } from "tinyglobby"

type NodeOutputOptions = {
    declaration?: boolean
    declarationSourceDir?: string
    formats?: Array<"esm" | "cjs">
    inputs: Record<string, string>
    minify?: boolean
    outDir: string
    plugins?: RolldownPlugin[]
    sourcemap?: boolean
    target?: "node20" | "browser" | "neutral"
}

type BundleOutputOptions = Omit<NodeOutputOptions, "inputs" | "plugins"> & {
    cwd?: string
    declaration?: boolean
    entry: string
    entries?: Record<string, string>
    formats?: Array<"esm" | "cjs">
    plugins?: RolldownPlugin[]
}

export type NodeOutputPlan = {
    declarationSourceDir?: string
    input: InputOptions
    outDir: string
    output: OutputOptions[]
    predictedOutput: string[]
}

type WritableBundle = Pick<RolldownBuild, "write">

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

const commonInput = (
    plugins: RolldownPlugin[],
    target: "node20" | "browser" | "neutral"
): Pick<InputOptions, "external" | "platform" | "plugins" | "transform"> => ({
    plugins,
    platform: target === "node20" ? "node" : target,
    ...(target === "node20" ? { transform: { target } } : {}),
    external: (id) => id.startsWith("node:") || (!id.startsWith(".") && !id.startsWith("/"))
})

export const applicationOutputPlan = ({
    declaration,
    declarationSourceDir,
    formats = ["esm"],
    inputs,
    minify,
    outDir,
    plugins = [],
    sourcemap,
    target = "node20"
}: NodeOutputOptions): NodeOutputPlan => {
    if (Object.keys(inputs).length === 0) throw new Error("No application source files found")

    const emitDeclarations = declaration === true
    return {
        ...(emitDeclarations && declarationSourceDir ? { declarationSourceDir } : {}),
        input: {
            input: inputs,
            ...commonInput([...plugins, ...(emitDeclarations ? [isolatedDeclarationPlugin()] : [])], target)
        },
        outDir,
        output: formats.map((format) => ({
            cleanDir: false,
            dir: outDir,
            entryFileNames: format === "esm" ? "[name].js" : "[name].cjs",
            format: format === "esm" ? "es" : "cjs",
            minify,
            sourcemap
        })),
        predictedOutput: Object.keys(inputs).flatMap((file) => {
            const output = formats.flatMap((format) => {
                const path = resolve(outDir, `${file}.${format === "esm" ? "js" : "cjs"}`)
                return sourcemap ? [path, `${path}.map`] : [path]
            })
            return emitDeclarations ? [...output, resolve(outDir, `${file}.d.ts`)] : output
        })
    }
}

export const writeApplicationOutput = async (options: NodeOutputOptions): Promise<string[]> => {
    const plan = applicationOutputPlan(options)
    const bundle = await rolldown(plan.input)
    try {
        return writeNodeOutput(plan, bundle)
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

const moveDeclarations = async (
    sourceDeclarations: string,
    outDir: string
): Promise<{ source: string[]; destination: string[] }> => {
    const files = await glob("**/*.d.{ts,mts,cts}", { absolute: true, cwd: sourceDeclarations })

    const destination = files.map((file) => resolve(outDir, relative(sourceDeclarations, file)))
    await Promise.all(files.map((file) => rename(file, resolve(outDir, relative(sourceDeclarations, file)))))
    const directories = new Set<string>()
    for (const file of files) {
        let directory = dirname(file)
        while (true) {
            directories.add(directory)
            if (directory === sourceDeclarations) break
            directory = dirname(directory)
        }
    }
    for (const directory of [...directories].sort((left, right) => right.length - left.length)) {
        try {
            await rmdir(directory)
        } catch (error) {
            if (!["ENOENT", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error
        }
    }
    return { source: files, destination }
}

export const bundledOutputPlan = ({
    cwd = process.cwd(),
    declaration,
    entry,
    entries,
    formats = ["esm"],
    minify,
    outDir,
    plugins = [],
    sourcemap,
    target = "node20"
}: BundleOutputOptions): NodeOutputPlan => {
    const emitDeclarations = declaration === true
    return {
        ...(emitDeclarations ? { declarationSourceDir: resolve(outDir, "src") } : {}),
        input: {
            input: bundledInputs(cwd, entry, entries),
            ...commonInput([...plugins, ...(emitDeclarations ? [isolatedDeclarationPlugin()] : [])], target)
        },
        outDir,
        output: formats.map((format) => ({
            cleanDir: false,
            dir: outDir,
            entryFileNames: format === "esm" ? "[name].js" : "[name].cjs",
            format: format === "esm" ? "es" : "cjs",
            minify,
            sourcemap
        })),
        predictedOutput: []
    }
}

export const normalizeNodeOutput = async (plan: NodeOutputPlan, output: string[]): Promise<string[]> => {
    const declarations = plan.declarationSourceDir
        ? await moveDeclarations(plan.declarationSourceDir, plan.outDir)
        : { source: [], destination: [] }
    return [...output.filter((file) => !declarations.source.includes(file)), ...declarations.destination]
}

export const writeNodeOutput = async (plan: NodeOutputPlan, bundle: WritableBundle): Promise<string[]> => {
    const output: string[] = []
    for (const options of plan.output) {
        const result = await bundle.write(options)
        output.push(...result.output.map((file) => resolve(plan.outDir, file.fileName)))
    }
    return normalizeNodeOutput(plan, output)
}

export const writeBundledOutput = async (options: BundleOutputOptions): Promise<string[]> => {
    const plan = bundledOutputPlan(options)
    const bundle = await rolldown(plan.input)
    try {
        return writeNodeOutput(plan, bundle)
    } finally {
        await bundle.close()
    }
}
