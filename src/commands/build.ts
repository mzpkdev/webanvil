import { resolve } from "pathe"

import { defineCommand } from "cmdore"
import { type InlineConfig, type PluginOption, build as vite, resolveConfig } from "vite"
import { glob } from "tinyglobby"

import { entry } from "../arguments"
import { hasToolConfig } from "../config-files"
import { assertSyntaxTarget, resolveEffectiveBuildConfig, withConfig } from "../config"
import { removeOutputsIn, writeBuildInfo } from "../core/build-info"
import { createNodeBuildPlan, type NodeBuildOptions, runNodeBuild } from "../core/node-build"
import { assertStaticCopyDestinationsAvailable, copyStaticFiles, planStaticCopies } from "../core/static-copy"
import { bundle, copy, declaration, formats, minify, mode, outDir, platform, sourcemap, target } from "../options"
import { resolveRolldownPlugins, resolveVitePlugins, type WebAnvilPlugin } from "../plugins"
import { logger } from "../tools"

export type BuildOptions = NodeBuildOptions

type WebBuild = { config: InlineConfig; emptyOutDir: boolean; outDir: string; publicDir?: string }

const outputFiles = (result: Awaited<ReturnType<typeof vite>>, outDir: string): string[] => {
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
    plugins: WebAnvilPlugin[] = []
): Promise<void> => {
    assertSyntaxTarget(options.target)
    if (mode === "web" && options.platform !== undefined) {
        throw new Error("Web builds do not accept platform; platform applies only to Node builds")
    }

    logger.start(`Building ${entry}`)

    if (mode === "node") {
        const plan = await createNodeBuildPlan(entry, outDir, options, resolveRolldownPlugins(plugins))
        await runNodeBuild(plan)
        logger.success(`Built ${entry} to ${outDir}`)
        return
    }

    const web = await build.webConfig(entry, outDir, options, plugins)
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
    plugins: WebAnvilPlugin[]
): Promise<WebBuild> => {
    assertSyntaxTarget(options.target)
    if (options.platform !== undefined) {
        throw new Error("Web builds do not accept platform; platform applies only to Node builds")
    }
    if (options.formats?.some((format) => format !== "esm")) {
        throw new Error("Web builds only support the esm format")
    }

    const preserveOutput = options.copy != null && options.copy.length > 0
    const config: InlineConfig = (await hasToolConfig("vite"))
        ? { root: process.cwd(), ...(preserveOutput ? { build: { emptyOutDir: false } } : {}) }
        : {
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
    const resolved = await resolveConfig(config, "build")
    return {
        config,
        emptyOutDir: resolved.build.emptyOutDir === true,
        outDir: resolved.build.outDir,
        publicDir: resolved.build.copyPublicDir ? resolved.publicDir : undefined
    }
}

build.publicOutputFiles = async ({ outDir, publicDir }: WebBuild): Promise<string[]> =>
    publicDir
        ? (await glob("**/*", { cwd: publicDir, onlyFiles: true, dot: true })).map((file) => resolve(outDir, file))
        : []

build.web = async (web: WebBuild): Promise<string[]> => [
    ...outputFiles(await vite(web.config), web.outDir),
    ...(await build.publicOutputFiles(web))
]

export default defineCommand({
    name: "build",
    arguments: [entry],
    options: [mode, outDir, bundle, copy, declaration, sourcemap, minify, formats, platform, target],
    run: withConfig(
        (config) => config.build,
        (
            { bundle, copy, declaration, formats, minify, mode, entry, "out-dir": outDir, platform, sourcemap, target },
            buildConfig,
            resolvedConfig,
            explicit
        ) => {
            const effective = resolveEffectiveBuildConfig(
                resolvedConfig,
                {
                    bundle: bundle || buildConfig.bundle,
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

            return build(effective.mode!, effective.entry!, effective.outDir!, effective, resolvedConfig.plugins ?? [])
        }
    )
})
