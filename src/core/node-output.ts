import { dirname, isAbsolute, relative, resolve } from "pathe"
import type {
    InputOptions,
    OutputAsset,
    OutputChunk,
    OutputOptions,
    Plugin as RolldownPlugin,
    RolldownOutput
} from "rolldown"

import { assertSyntaxTarget, type RolldownConfig, type SyntaxTarget } from "../config"
import { projectExternalPlugin } from "./node-resolve"

type NodePlatform = "node" | "browser" | "neutral"
type NodeFormat = "esm" | "cjs"

export type NodeOutputPlan = {
    authoredInputs: string[]
    input: InputOptions
    outDir: string
    output: OutputOptions[]
}

export type GeneratedNodeFile = {
    fileName: string
    source: string | Uint8Array
}

type NodeOutputOptions = {
    bundle?: boolean
    cwd?: string
    declarationPlugins?: RolldownPlugin[]
    entry: string
    entries?: Record<string, string>
    formats?: NodeFormat[]
    minify?: boolean
    native?: RolldownConfig
    outDir: string
    platform?: NodePlatform
    plugins?: RolldownPlugin[]
    sourcemap?: boolean
    target?: SyntaxTarget
}

const sourceExtensions = [".cts", ".mts", ".tsx", ".jsx", ".ts", ".js"]

const rolldownRuntimePlugin = (): RolldownPlugin => ({
    name: "webanvil-rolldown-runtime",
    resolveId: {
        order: "pre",
        handler(source, importer) {
            if (source !== "node:module" || importer !== "\0rolldown/runtime.js") return null
            return { id: source, external: true, moduleSideEffects: false }
        }
    }
})

const withoutExtension = (path: string): string => {
    const extension = sourceExtensions.find((candidate) => path.endsWith(candidate))
    return extension === undefined ? path : path.slice(0, -extension.length)
}

const entryName = (subpath: string): string => (subpath === "." ? "index" : subpath.replace(/^\.\//, ""))

const defaultEntryName = (entry: string, cwd: string): string =>
    withoutExtension(relative(cwd, resolve(cwd, entry))).replace(/^src\//, "")

export const resolvePublicInputs = (
    cwd: string,
    entry: string,
    entries?: Record<string, string>
): Record<string, string> => {
    if (entries === undefined) return { [defaultEntryName(entry, cwd)]: resolve(cwd, entry) }

    const inputs: Record<string, string> = {}
    const names = new Map<string, string>()
    const sources = new Map<string, string>()
    for (const [subpath, source] of Object.entries(entries)) {
        const name = entryName(subpath)
        const existingName = names.get(name)
        if (existingName !== undefined) {
            throw new Error(`Node entries ${existingName} and ${subpath} normalize to the same public name: ${name}`)
        }
        names.set(name, subpath)

        const resolved = resolve(cwd, source)
        const existing = sources.get(resolved)
        if (existing !== undefined) {
            throw new Error(`Node entries ${existing} and ${subpath} resolve to the same source file`)
        }
        sources.set(resolved, subpath)
        inputs[name] = resolved
    }
    if (Object.keys(inputs).length === 0) throw new Error("Node build entries cannot be empty")
    return inputs
}

const commonSourceRoot = (inputs: Record<string, string>): string => {
    const directories = Object.values(inputs).map(dirname)
    let root = directories[0]!
    for (const directory of directories.slice(1)) {
        while (relative(root, directory).startsWith("../") || isAbsolute(relative(root, directory))) {
            const parent = dirname(root)
            if (parent === root) return root
            root = parent
        }
    }
    return root
}

const outputForFormat = (
    format: NodeFormat,
    native: OutputOptions | undefined,
    owned: Pick<OutputOptions, "dir" | "preserveModules" | "preserveModulesRoot"> &
        Partial<Pick<OutputOptions, "minify" | "sourcemap">>
): OutputOptions => ({
    entryFileNames: format === "esm" ? "[name].js" : "[name].cjs",
    chunkFileNames: format === "esm" ? "[name]-[hash].js" : "[name]-[hash].cjs",
    polyfillRequire: false,
    ...native,
    ...owned,
    cleanDir: false,
    format: format === "esm" ? "es" : "cjs"
})

export const nodeOutputPlan = ({
    bundle = false,
    cwd = process.cwd(),
    declarationPlugins = [],
    entry,
    entries,
    formats = ["esm"],
    minify,
    native,
    outDir,
    platform = "node",
    plugins = [],
    sourcemap,
    target = "node20"
}: NodeOutputOptions): NodeOutputPlan => {
    assertSyntaxTarget(target)
    const inputs = resolvePublicInputs(cwd, entry, entries)
    const preserveModulesRoot = commonSourceRoot(inputs)
    const nativeInput = native?.input ?? {}
    const nativePlugins = (nativeInput.plugins ?? []) as RolldownPlugin[]
    const resolveOptions =
        platform === "neutral" && nativeInput.resolve?.mainFields === undefined
            ? { ...nativeInput.resolve, mainFields: ["module", "main"] }
            : nativeInput.resolve
    const input: InputOptions = {
        tsconfig: true,
        ...nativeInput,
        input: inputs,
        platform,
        ...(resolveOptions === undefined ? {} : { resolve: resolveOptions }),
        transform: {
            ...(typeof nativeInput.transform === "object" ? nativeInput.transform : {}),
            target
        },
        plugins: [
            rolldownRuntimePlugin(),
            projectExternalPlugin(cwd),
            ...nativePlugins,
            ...plugins,
            ...declarationPlugins
        ]
    }

    return {
        authoredInputs: Object.values(inputs),
        input,
        outDir,
        output: formats.map((format) =>
            outputForFormat(format, native?.output?.[format], {
                dir: outDir,
                ...(minify === undefined ? {} : { minify }),
                preserveModules: !bundle,
                ...(!bundle ? { preserveModulesRoot } : {}),
                ...(sourcemap === undefined ? {} : { sourcemap })
            })
        )
    }
}

export const authoredNodeSources = (plan: NodeOutputPlan, outputs: RolldownOutput[]): string[] => {
    const sources = new Set(plan.authoredInputs)
    for (const output of outputs) {
        for (const file of output.output) {
            if (file.type !== "chunk") continue
            for (const source of Object.keys(file.modules)) {
                if (isAbsolute(source)) sources.add(source)
            }
            if (file.facadeModuleId !== null && isAbsolute(file.facadeModuleId)) {
                sources.add(file.facadeModuleId)
            }
        }
    }
    return [...sources]
}

const sourceBytes = (file: OutputAsset | OutputChunk): string | Uint8Array =>
    file.type === "chunk" ? file.code : file.source

export const generatedNodeFiles = (outputs: RolldownOutput[]): GeneratedNodeFile[] => {
    const generated = new Map<string, GeneratedNodeFile>()
    for (const output of outputs) {
        for (const file of output.output) {
            const fileName = file.fileName
            const source = sourceBytes(file)
            const existing = generated.get(fileName)
            if (existing !== undefined) {
                throw new Error(`Rolldown outputs collide at ${fileName}`)
            }
            generated.set(fileName, { fileName, source })
        }
    }
    return [...generated.values()]
}
