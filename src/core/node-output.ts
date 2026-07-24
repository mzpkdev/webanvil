import { mkdir, mkdtemp, rename, rm, rmdir } from "node:fs/promises"
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

import { assertSyntaxTarget, type SyntaxTarget } from "../config"

type NodePlatform = "node" | "browser" | "neutral"

type NodeOutputOptions = {
    declaration?: boolean
    declarationSourceDir?: string
    formats?: Array<"esm" | "cjs">
    inputs: Record<string, string>
    minify?: boolean
    outDir: string
    platform?: NodePlatform
    plugins?: RolldownPlugin[]
    sourcemap?: boolean
    target?: SyntaxTarget
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
    declarationAliases?: DeclarationAlias[]
    declarationSourceDir?: string
    input: InputOptions
    outDir: string
    output: OutputOptions[]
    predictedOutput: string[]
}

type DeclarationAlias = {
    destination: string
    source: string
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
    platform: NodePlatform = "node",
    target: SyntaxTarget = "node20"
): Pick<InputOptions, "external" | "platform" | "plugins" | "transform"> => {
    assertSyntaxTarget(target)
    return {
        plugins,
        platform,
        transform: { target },
        external: (id) => id.startsWith("node:") || (!id.startsWith(".") && !id.startsWith("/"))
    }
}

export const applicationOutputPlan = ({
    declaration,
    declarationSourceDir,
    formats = ["esm"],
    inputs,
    minify,
    outDir,
    platform,
    plugins = [],
    sourcemap,
    target
}: NodeOutputOptions): NodeOutputPlan => {
    if (Object.keys(inputs).length === 0) throw new Error("No application source files found")

    const emitDeclarations = declaration === true
    return {
        ...(emitDeclarations && declarationSourceDir ? { declarationSourceDir } : {}),
        input: {
            input: inputs,
            ...commonInput([...plugins, ...(emitDeclarations ? [isolatedDeclarationPlugin()] : [])], platform, target)
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
    if (entries === undefined) {
        return { [defaultEntryName(entry, cwd)]: resolve(cwd, entry) }
    }

    const inputs: Record<string, string> = {}
    const sources = new Map<string, string>()
    for (const [subpath, source] of Object.entries(entries)) {
        const resolved = resolve(cwd, source)
        const existing = sources.get(resolved)
        if (existing !== undefined) {
            throw new Error(`Bundled entries ${existing} and ${subpath} resolve to the same source file`)
        }
        sources.set(resolved, subpath)
        inputs[entryName(subpath)] = resolved
    }
    return inputs
}

const bundledDeclarationAliases = (inputs: Record<string, string>, cwd: string, outDir: string): DeclarationAlias[] =>
    Object.entries(inputs).map(([name, source]) => ({
        destination: resolve(outDir, `${name}.d.ts`),
        source: resolve(outDir, `${defaultEntryName(source, cwd)}.d.ts`)
    }))

const moveDeclarations = async (
    sourceDeclarations: string,
    outDir: string
): Promise<{ source: string[]; destination: string[] }> => {
    const files = await glob("**/*.d.{ts,mts,cts}", { absolute: true, cwd: sourceDeclarations })

    const destination = files.map((file) => resolve(outDir, relative(sourceDeclarations, file)))
    await Promise.all(destination.map((file) => mkdir(dirname(file), { recursive: true })))
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
    platform,
    plugins = [],
    sourcemap,
    target
}: BundleOutputOptions): NodeOutputPlan => {
    const emitDeclarations = declaration === true
    const inputs = bundledInputs(cwd, entry, entries)
    return {
        ...(emitDeclarations
            ? {
                  declarationAliases: bundledDeclarationAliases(inputs, cwd, outDir),
                  declarationSourceDir: resolve(outDir, "src")
              }
            : {}),
        input: {
            input: inputs,
            ...commonInput([...plugins, ...(emitDeclarations ? [isolatedDeclarationPlugin()] : [])], platform, target)
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

const applyDeclarationAliases = async (
    aliases: DeclarationAlias[],
    files: string[],
    outDir: string
): Promise<{ source: string[]; destination: string[] }> => {
    const available = new Set(files)
    const applicable = aliases.filter(({ source, destination }) => source !== destination && available.has(source))
    await Promise.all(applicable.map(({ destination }) => mkdir(dirname(destination), { recursive: true })))
    if (applicable.length > 0) {
        const stagingDirectory = await mkdtemp(resolve(outDir, ".webanvil-declaration-aliases-"))
        const staged = applicable.map((alias, index) => ({
            ...alias,
            staged: resolve(stagingDirectory, `${index}.d.ts`)
        }))
        try {
            await Promise.all(staged.map(({ source, staged }) => rename(source, staged)))
            await Promise.all(staged.map(({ destination, staged }) => rename(staged, destination)))
        } catch (error) {
            await rm(stagingDirectory, { force: true, recursive: true })
            throw error
        }
        await rmdir(stagingDirectory)
    }
    const directories = new Set<string>()
    for (const { source } of applicable) {
        let directory = dirname(source)
        while (directory !== outDir) {
            directories.add(directory)
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
    return {
        destination: applicable.map(({ destination }) => destination),
        source: applicable.map(({ source }) => source)
    }
}

export const normalizeNodeOutput = async (plan: NodeOutputPlan, output: string[]): Promise<string[]> => {
    const moved = plan.declarationSourceDir
        ? await moveDeclarations(plan.declarationSourceDir, plan.outDir)
        : { source: [], destination: [] }
    const aliased = await applyDeclarationAliases(
        plan.declarationAliases ?? [],
        [...output, ...moved.destination],
        plan.outDir
    )
    const replaced = new Set([...moved.source, ...aliased.source])
    return [
        ...output.filter((file) => !replaced.has(file)),
        ...moved.destination.filter((file) => !replaced.has(file)),
        ...aliased.destination
    ]
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
