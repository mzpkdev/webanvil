import { realpath } from "node:fs/promises"
import { createRequire, Module } from "node:module"
import { isAbsolute, join, relative, resolve } from "node:path"

import { getTsconfig, readTsconfig, type TsconfigJson } from "get-tsconfig"
import type { Plugin as RolldownPlugin } from "rolldown"
import type { IsolatedDeclarationsOptions } from "rolldown/experimental"
import { dts, type Options as DtsOptions } from "rolldown-plugin-dts"

import { resolveDeclaredPackage, type ResolvedTool, type Toolchain } from "./toolchain"

type DeclarationLogger = {
    info: (...arguments_: unknown[]) => void
    warn: (...arguments_: unknown[]) => void
    error: (...arguments_: unknown[]) => void
}

type DeclarationVolarPlugin = {
    extensionPatterns: RegExp[]
    tsFileExtensionInfos?: Array<{
        extension: string
        isMixedContent: boolean
        scriptKind?: number
    }>
    volarTypeScript?: object
    create?: (...arguments_: never[]) => unknown
    toTsFilename?: (id: string) => string
}

export type DeclarationConfig = {
    generator?: "tsc" | "oxc" | "tsgo"
    dtsInput?: boolean
    tsconfig?: string | boolean
    tsconfigRaw?: Omit<TsconfigJson, "compilerOptions">
    compilerOptions?: TsconfigJson.CompilerOptions
    sourcemap?: boolean
    resolver?: "oxc" | "tsc"
    cjsDefault?: boolean
    sideEffects?: boolean
    logger?: DeclarationLogger
    build?: boolean
    incremental?: boolean
    vue?: boolean
    eager?: boolean
    newContext?: boolean
    emitJs?: boolean
    oxc?: boolean | Omit<IsolatedDeclarationsOptions, "sourcemap">
    tsgo?: boolean | { path?: string }
    volarPlugins?: DeclarationVolarPlugin[]
}

export const declarationDefaults = {
    generator: "tsc",
    incremental: false,
    newContext: true,
    parallel: false
} satisfies DtsOptions

type CompilerPlugin = {
    transform?: unknown
}

type CompilerIdentity = {
    realpath: string
    version: string
}

type ModuleResolver = (
    request: string,
    parent: { filename?: string } | undefined,
    isMain: boolean,
    options?: unknown
) => string

let compilerIdentity: CompilerIdentity | undefined
let setupTail = Promise.resolve()

const serializeSetup = async <T>(setup: () => Promise<T>): Promise<T> => {
    const previous = setupTail
    let release!: () => void
    setupTail = new Promise<void>((resolvePromise) => {
        release = resolvePromise
    })
    await previous
    try {
        return await setup()
    } finally {
        release()
    }
}

const compilerPlugins = (
    cwd: string,
    config: DeclarationConfig
): { plugins: CompilerPlugin[]; tsconfigPath?: string } => {
    if (config.tsconfig === false) {
        return {
            plugins: ((config.compilerOptions as { plugins?: CompilerPlugin[] } | undefined)?.plugins ?? []).filter(
                (plugin) => typeof plugin.transform === "string"
            )
        }
    }

    const result = typeof config.tsconfig === "string" ? readTsconfig(resolve(cwd, config.tsconfig)) : getTsconfig(cwd)
    const configured = (result?.config.compilerOptions as { plugins?: CompilerPlugin[] } | undefined)?.plugins ?? []
    const overridden = (config.compilerOptions as { plugins?: CompilerPlugin[] } | undefined)?.plugins
    return {
        plugins: (overridden ?? configured).filter((plugin) => typeof plugin.transform === "string"),
        ...(result === undefined ? {} : { tsconfigPath: result.path })
    }
}

const packageName = (specifier: string): string | undefined => {
    if (specifier.startsWith(".") || isAbsolute(specifier)) return
    const parts = specifier.split("/")
    return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

const assertTransformPackages = async (plugins: CompilerPlugin[], cwd: string): Promise<void> => {
    for (const plugin of plugins) {
        if (typeof plugin.transform !== "string") continue
        const name = packageName(plugin.transform)
        if (name === undefined) continue
        const declared = await resolveDeclaredPackage(name, cwd)
        const require = createRequire(join(declared.declarationDirectory, "package.json"))
        let resolvedTransform: string
        try {
            resolvedTransform = require.resolve(plugin.transform)
        } catch (error) {
            throw new Error(`TypeScript declaration transform ${plugin.transform} is declared but cannot be resolved`, {
                cause: error
            })
        }
        const packageRelative = relative(declared.packageRoot, resolvedTransform)
        if (packageRelative.startsWith("..") || isAbsolute(packageRelative)) {
            throw new Error(
                `TypeScript declaration transform ${plugin.transform} resolved outside its declared ${name} package`
            )
        }
    }
}

const typescriptEntry = (tool: ResolvedTool): string =>
    createRequire(join(tool.packageRoot, "package.json")).resolve("typescript")

const patchedCompilerEntry = async (
    typescript: ResolvedTool,
    cwd: string,
    plugins: CompilerPlugin[]
): Promise<string> => {
    if (plugins.length === 0) return typescriptEntry(typescript)

    await assertTransformPackages(plugins, cwd)
    const tsPatch = await resolveDeclaredPackage("ts-patch", cwd)
    const require = createRequire(join(tsPatch.declarationDirectory, "package.json"))
    let patchedEntry: string
    try {
        patchedEntry = require.resolve("ts-patch/compiler")
    } catch (error) {
        throw new Error("ts-patch is declared but its patched compiler entry cannot be resolved", {
            cause: error
        })
    }

    const patchRequire = createRequire(join(tsPatch.packageRoot, "package.json"))
    const patchTypescript = await realpath(patchRequire.resolve("typescript"))
    const selectedTypescript = await realpath(typescriptEntry(typescript))
    if (patchTypescript !== selectedTypescript) {
        throw new Error(
            `ts-patch resolves TypeScript at ${patchTypescript}, but WebAnvil selected ${selectedTypescript}; install both from the same project or workspace`
        )
    }

    const patched = require(patchedEntry) as { version?: unknown }
    if (patched.version !== typescript.version) {
        throw new Error(
            `ts-patch compiler ${String(patched.version)} does not match selected TypeScript ${typescript.version}`
        )
    }
    return patchedEntry
}

const withCompilerResolution = <T>(entry: string, run: () => T): T => {
    const module = Module as unknown as { _resolveFilename: ModuleResolver }
    const original = module._resolveFilename
    module._resolveFilename = function (request, parent, isMain, options) {
        if (request === "typescript" && parent?.filename?.includes("rolldown-plugin-dts")) return entry
        return original.call(this, request, parent, isMain, options)
    }
    try {
        return run()
    } finally {
        module._resolveFilename = original
    }
}

const assertCompilerIdentity = (selected: CompilerIdentity): void => {
    if (compilerIdentity === undefined) {
        compilerIdentity = selected
        return
    }
    if (compilerIdentity.realpath === selected.realpath && compilerIdentity.version === selected.version) return
    throw new Error(
        `rolldown-plugin-dts already initialized TypeScript ${compilerIdentity.version} from ${compilerIdentity.realpath}; ` +
            `this process cannot switch to TypeScript ${selected.version} from ${selected.realpath}. ` +
            "Run builds that require different TypeScript compilers in separate processes."
    )
}

const withoutImplicitIncremental = (config: DeclarationConfig): DeclarationConfig => {
    const compilerOptions = config.compilerOptions as
        | (TsconfigJson.CompilerOptions & { incremental?: boolean; tsBuildInfoFile?: string })
        | undefined
    const explicitlyRequested =
        config.incremental === true ||
        compilerOptions?.incremental === true ||
        typeof compilerOptions?.tsBuildInfoFile === "string"
    if (explicitlyRequested) return config
    return {
        ...config,
        incremental: false,
        compilerOptions: {
            ...compilerOptions,
            incremental: false,
            tsBuildInfoFile: undefined
        }
    }
}

export const createDeclarationPlugins = async (
    declaration: true | DeclarationConfig,
    cwd: string,
    toolchain: Toolchain,
    emitDtsOnly: boolean
): Promise<RolldownPlugin[]> =>
    serializeSetup(async () => {
        const configured = withoutImplicitIncremental(declaration === true ? {} : declaration)
        const generator = configured.generator ?? declarationDefaults.generator
        const { plugins, tsconfigPath } = compilerPlugins(cwd, configured)
        if (plugins.length > 0 && generator !== "tsc") {
            throw new Error(
                `TypeScript declaration transforms from ${tsconfigPath ?? "compilerOptions"} require build.declaration.generator "tsc"; ` +
                    `${generator} cannot apply TypeScript emit transforms`
            )
        }

        const options: DtsOptions = {
            ...declarationDefaults,
            ...(configured as Omit<DtsOptions, "cwd" | "emitDtsOnly" | "entry" | "parallel">),
            cwd,
            emitDtsOnly,
            generator,
            parallel: false
        }
        if (generator === "tsgo") {
            const tsgo = await toolchain.resolve("typescript-native")
            if (tsgo.executable === undefined) {
                throw new Error(`${tsgo.packageName} does not provide the tsgo executable required for declarations`)
            }
            options.tsgo = {
                ...(typeof configured.tsgo === "object" ? configured.tsgo : {}),
                path: tsgo.executable
            }
        }
        if (generator !== "tsc") return dts(options)

        const typescript = await toolchain.resolve("typescript")
        const compilerEntry = await patchedCompilerEntry(typescript, cwd, plugins)
        const selected = {
            realpath: await realpath(compilerEntry),
            version: typescript.version
        }
        assertCompilerIdentity(selected)
        return withCompilerResolution(compilerEntry, () => dts(options))
    })
