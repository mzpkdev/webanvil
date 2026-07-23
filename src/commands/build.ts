import { resolve } from "pathe"

import { defineCommand } from "cmdore"
import { type InlineConfig, type PluginOption, build as vite, resolveConfig } from "vite"
import { glob } from "tinyglobby"

import { entry } from "../arguments"
import { hasToolConfig } from "../config-files"
import { type BuildConfig, withConfig } from "../config"
import { removeOutputsIn, writeBuildInfo } from "../core/build-info"
import { applicationInputs, sourceRoot, writeApplicationOutput, writeBundledOutput } from "../core/node-output"
import { assertStaticCopyDestinationsAvailable, copyStaticFiles, planStaticCopies } from "../core/static-copy"
import { bundle, copy, declaration, formats, minify, mode, outDir, sourcemap, target } from "../options"
import { resolveRolldownPlugins, resolveVitePlugins, type WebAnvilPlugin } from "../plugins"
import { logger } from "../tools"

type BuildOptions = Pick<
    BuildConfig,
    "bundle" | "copy" | "declaration" | "entries" | "formats" | "minify" | "sourcemap" | "target"
>

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
    logger.start(`Building ${entry}`)

    const web = mode === "web" ? await build.webConfig(entry, outDir, options, plugins) : undefined
    const target = web?.outDir ?? resolve(process.cwd(), outDir)
    const copies = await planStaticCopies(options.copy, target)
    if (web?.emptyOutDir && copies.length > 0) {
        throw new Error("Vite build.emptyOutDir must be false when using static copy mappings")
    }
    const publicOutput = web ? await build.publicOutputFiles(web) : []
    const predictedOutput = web ? publicOutput : await build.nodeOutputFiles(entry, target, options)
    await assertStaticCopyDestinationsAvailable(copies, predictedOutput, false)
    const existing = await removeOutputsIn(target)
    await assertStaticCopyDestinationsAvailable(copies)
    const output = web
        ? await build.web(web)
        : options.bundle
          ? await build.bundle(entry, outDir, options, plugins)
          : await build.node(entry, outDir, options, plugins)

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
    if (options.formats?.some((format) => format !== "esm")) {
        throw new Error("Web builds only support the esm format")
    }
    if (options.target != null && options.target !== "browser") {
        throw new Error("Web builds only support the browser target")
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

build.nodeOutputFiles = async (entry: string, outDir: string, options: BuildOptions): Promise<string[]> => {
    if (options.bundle) return []

    const inputs = await applicationInputs(sourceRoot(entry))
    return Object.keys(inputs).flatMap((file) => {
        const output = resolve(outDir, `${file}.js`)
        return options.sourcemap ? [output, `${output}.map`] : [output]
    })
}

build.web = async (web: WebBuild): Promise<string[]> => [
    ...outputFiles(await vite(web.config), web.outDir),
    ...(await build.publicOutputFiles(web))
]

build.node = async (
    entry: string,
    outDir: string,
    options: BuildOptions,
    plugins: WebAnvilPlugin[]
): Promise<string[]> => {
    if (options.declaration) throw new Error("Declarations require --bundle")
    if (options.formats?.some((format) => format !== "esm")) {
        throw new Error("CommonJS output requires --bundle")
    }

    return writeApplicationOutput({
        inputs: await applicationInputs(sourceRoot(entry)),
        minify: options.minify,
        outDir: resolve(process.cwd(), outDir),
        // Users select Rolldown-compatible plugins for Node builds in their config.
        plugins: resolveRolldownPlugins(plugins),
        sourcemap: options.sourcemap,
        target: options.target
    })
}

build.bundle = async (
    entry: string,
    outDir: string,
    options: BuildOptions,
    plugins: WebAnvilPlugin[]
): Promise<string[]> => {
    return writeBundledOutput({
        declaration: options.declaration,
        entry,
        entries: options.entries,
        formats: options.formats,
        minify: options.minify,
        outDir: resolve(process.cwd(), outDir),
        plugins: resolveRolldownPlugins(plugins),
        sourcemap: options.sourcemap,
        target: options.target
    })
}

export default defineCommand({
    name: "build",
    arguments: [entry],
    options: [mode, outDir, bundle, copy, declaration, sourcemap, minify, formats, target],
    run: withConfig(
        (config) => config.build,
        (
            { bundle, copy, declaration, formats, minify, mode, entry, "out-dir": outDir, sourcemap, target },
            _buildConfig,
            resolvedConfig
        ) =>
            build(
                mode,
                entry,
                outDir,
                {
                    bundle: bundle || _buildConfig.bundle,
                    copy,
                    declaration,
                    entries: _buildConfig.entries,
                    formats,
                    minify,
                    sourcemap,
                    target
                },
                resolvedConfig.plugins ?? []
            )
    )
})
