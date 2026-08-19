import { resolve } from "pathe"

import { defineCommand, defineOption } from "cmdore"
import { glob } from "tinyglobby"
import type { InlineConfig, PluginOption, UserConfig as ViteConfig } from "vite"

import { entry } from "../arguments"
import { hasToolConfig } from "../config-files"
import {
    assertSyntaxTarget,
    type BuildConfig,
    type CopyMapping,
    type RolldownConfig,
    loadConfig,
    resolveEffectiveBuildConfig,
    withConfig
} from "../config"
import { removeOutputsIn, writeBuildInfo } from "../core/build-info"
import { createNodeBuildPlan, type NodeBuildOptions, runNodeBuild } from "../core/node-build"
import { runStorybook, storybookOutputDir } from "../core/storybook"
import { assertStaticCopyDestinationsAvailable, copyStaticFiles, planStaticCopies } from "../core/static-copy"
import { Toolchain } from "../core/toolchain"
import { useToolApi } from "../core/use-tool"
import { bundle, copy, declaration, formats, minify, mode, outDir, platform, sourcemap, target } from "../options"
import { resolveRolldownPlugins, resolveVitePlugins, type WebAnvilPlugin } from "../plugins"
import { logger } from "../tools"

export type BuildOptions = NodeBuildOptions

type ViteApi = typeof import("vite")
type RolldownApi = typeof import("rolldown")
type ExplicitWebBuild = Partial<BuildOptions> & { entry?: string; outDir?: string }
type BuildCommandArguments = {
    bundle?: boolean
    copy?: CopyMapping[]
    declaration?: BuildConfig["declaration"]
    entry?: string
    formats?: Array<"esm" | "cjs">
    minify?: boolean
    mode?: "web" | "node" | "storybook"
    "no-bundle"?: boolean
    "out-dir"?: string
    platform?: "node" | "browser" | "neutral"
    sourcemap?: boolean
    target?: string | string[]
}
const noBundle = defineOption({
    name: "no-bundle",
    description: "Emit the reachable Node graph with preserveModules, overriding configuration that enables bundling.",
    arity: 0
})

const assertStorybookArguments = (explicit: BuildCommandArguments): void => {
    const incompatible = [
        "bundle",
        "copy",
        "declaration",
        "entry",
        "formats",
        "minify",
        "no-bundle",
        "platform",
        "sourcemap",
        "target"
    ] as const
    const option = incompatible.find((name) => {
        const value = explicit[name]
        return name === "bundle" || name === "no-bundle" ? value === true : value !== undefined
    })
    if (option !== undefined) throw new Error(`--${option} is not available in Storybook mode`)
}
type WebBuild = {
    config: InlineConfig
    emptyOutDir: boolean
    outDir: string
    publicDir?: string
    vite: ViteApi
}

const outputFiles = (result: Awaited<ReturnType<ViteApi["build"]>>, outDir: string): string[] => {
    if ("on" in result) throw new Error("Web builds cannot use watch mode")
    return (Array.isArray(result) ? result : [result]).flatMap((output) =>
        output.output.map((file) => resolve(outDir, file.fileName))
    )
}

export const build = async (
    mode: "web" | "node",
    entry: string,
    outDir: string,
    options: BuildOptions = {},
    plugins: WebAnvilPlugin[] = [],
    viteConfig: ViteConfig = {},
    rolldownConfig: RolldownConfig = {},
    toolchain = new Toolchain(process.cwd()),
    explicit: ExplicitWebBuild = {}
): Promise<void> => {
    assertSyntaxTarget(options.target)
    if (mode === "web" && options.platform !== undefined) {
        throw new Error("Web builds do not accept platform; platform applies only to Node builds")
    }

    logger.start(`Building ${entry}`)

    if (mode === "node") {
        const rolldown = await useToolApi<RolldownApi>("rolldown", undefined, toolchain)
        const plan = await createNodeBuildPlan(
            entry,
            outDir,
            options,
            resolveRolldownPlugins(plugins),
            rolldownConfig,
            toolchain
        )
        await runNodeBuild(plan, rolldown.rolldown)
        logger.success(`Built ${entry} to ${outDir}`)
        return
    }

    const web = await build.webConfig(entry, outDir, options, plugins, viteConfig, toolchain, explicit)
    const target = web.outDir
    const copies = await planStaticCopies(options.copy, target)
    if (web.emptyOutDir && copies.length > 0) {
        throw new Error("Vite build.emptyOutDir must be false when using static copy mappings")
    }
    const publicOutput = await build.publicOutputFiles(web)
    await assertStaticCopyDestinationsAvailable(copies, publicOutput, false)
    const existing = await removeOutputsIn(target)
    await assertStaticCopyDestinationsAvailable(copies)
    const output = await build.web(web)

    const copied = await copyStaticFiles(copies, output)
    await writeBuildInfo([...existing.output, ...output, ...copied])

    logger.success(`Built ${entry} to ${outDir}`)
}

build.webConfig = async (
    entry: string,
    outDir: string,
    options: BuildOptions,
    plugins: WebAnvilPlugin[],
    viteConfig: ViteConfig = {},
    toolchain = new Toolchain(process.cwd()),
    explicit: ExplicitWebBuild = {}
): Promise<WebBuild> => {
    assertSyntaxTarget(options.target)
    if (options.platform !== undefined) {
        throw new Error("Web builds do not accept platform; platform applies only to Node builds")
    }
    if (options.formats?.some((format) => format !== "esm")) {
        throw new Error("Web builds only support the esm format")
    }

    const preserveOutput = options.copy != null && options.copy.length > 0
    const vite = await useToolApi<ViteApi>("vite", undefined, toolchain)
    const webanvilDefaults: InlineConfig = {
        root: process.cwd(),
        // Users select Vite-compatible plugins for web builds in their config.
        plugins: resolveVitePlugins(plugins) as PluginOption[],
        build: {
            ...(preserveOutput ? { emptyOutDir: false } : {}),
            outDir: resolve(process.cwd(), outDir),
            minify: options.minify,
            sourcemap: options.sourcemap,
            ...(options.target === undefined ? {} : { target: options.target }),
            rolldownOptions: { input: resolve(process.cwd(), entry) }
        }
    }
    const explicitBuild: NonNullable<InlineConfig["build"]> = {
        ...(explicit.outDir === undefined ? {} : { outDir: resolve(process.cwd(), explicit.outDir) }),
        ...(explicit.minify === undefined ? {} : { minify: explicit.minify }),
        ...(explicit.sourcemap === undefined ? {} : { sourcemap: explicit.sourcemap }),
        ...(explicit.target === undefined ? {} : { target: explicit.target }),
        ...(explicit.entry === undefined ? {} : { rolldownOptions: { input: resolve(process.cwd(), explicit.entry) } }),
        ...(preserveOutput ? { emptyOutDir: false } : {})
    }
    const config: InlineConfig = (await hasToolConfig("vite"))
        ? {
              root: process.cwd(),
              ...(Object.keys(explicitBuild).length === 0 ? {} : { build: explicitBuild })
          }
        : vite.mergeConfig(
              vite.mergeConfig(webanvilDefaults, viteConfig),
              Object.keys(explicitBuild).length === 0 ? {} : { build: explicitBuild }
          )
    const resolved = await vite.resolveConfig(config, "build", "production", "production")
    return {
        config,
        emptyOutDir: resolved.build.emptyOutDir === true,
        outDir: resolved.build.outDir,
        publicDir: resolved.build.copyPublicDir ? resolved.publicDir : undefined,
        vite
    }
}

build.publicOutputFiles = async ({ outDir, publicDir }: WebBuild): Promise<string[]> =>
    publicDir
        ? (await glob("**/*", { cwd: publicDir, onlyFiles: true, dot: true })).map((file) => resolve(outDir, file))
        : []

build.web = async (web: WebBuild): Promise<string[]> => [
    ...outputFiles(await web.vite.build(web.config), web.outDir),
    ...(await build.publicOutputFiles(web))
]

const commandRun = (toolchain: Toolchain) =>
    withConfig<BuildConfig, BuildCommandArguments, void>(
        (config) => config.build,
        (
            { copy, declaration, formats, minify, mode, entry, "out-dir": outDir, platform, sourcemap, target },
            buildConfig,
            resolvedConfig,
            explicit
        ) => {
            if (mode === "storybook") {
                assertStorybookArguments(explicit)
                const storybookOptions = { outDir: explicit["out-dir"] === undefined ? undefined : outDir }
                const outputDirectory = storybookOutputDir(resolvedConfig.storybook, storybookOptions)
                return (async () => {
                    const existing = await removeOutputsIn(outputDirectory)
                    await runStorybook("build", resolvedConfig.storybook, storybookOptions, toolchain)
                    const output = await glob("**/*", {
                        cwd: resolve(process.cwd(), outputDirectory),
                        dot: true,
                        onlyFiles: true
                    })
                    await writeBuildInfo([...existing.output, ...output.map((file) => resolve(outputDirectory, file))])
                })()
            }
            if (explicit.bundle && explicit["no-bundle"]) {
                throw new Error("--bundle and --no-bundle cannot be used together")
            }
            const effectiveBundle = explicit["no-bundle"] ? false : explicit.bundle ? true : buildConfig.bundle
            const effective = resolveEffectiveBuildConfig(
                resolvedConfig,
                {
                    bundle: effectiveBundle,
                    copy,
                    declaration,
                    entries: buildConfig.entries,
                    entry,
                    formats,
                    minify,
                    mode,
                    outDir,
                    platform,
                    sourcemap,
                    target
                },
                explicit.entry !== undefined
            )

            const executableMode = effective.mode
            if (executableMode !== "web" && executableMode !== "node")
                throw new Error("Expected a web or Node build mode")

            return build(
                executableMode,
                effective.entry!,
                effective.outDir!,
                effective,
                resolvedConfig.plugins ?? [],
                resolvedConfig.vite,
                resolvedConfig.rolldown,
                toolchain,
                {
                    ...(explicit.entry === undefined ? {} : { entry }),
                    ...(explicit["out-dir"] === undefined ? {} : { outDir }),
                    ...(explicit.minify === undefined ? {} : { minify }),
                    ...(explicit.sourcemap === undefined ? {} : { sourcemap }),
                    ...(explicit.target === undefined ? {} : { target })
                }
            )
        }
    )

export default defineCommand({
    name: "build",
    arguments: [entry],
    options: [mode, outDir, bundle, noBundle, copy, declaration, sourcemap, minify, formats, platform, target],
    run: async (arguments_) => {
        const config = arguments_.mode === undefined ? (await loadConfig()).config : undefined
        const selectedMode = arguments_.mode ?? config?.build?.mode
        const toolchain = new Toolchain(process.cwd())
        if (selectedMode === "storybook") await toolchain.resolve("storybook")
        else await Promise.all([toolchain.resolve("vite"), toolchain.resolve("rolldown")])
        return commandRun(toolchain)(arguments_, config)
    }
})
