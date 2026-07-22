import { resolve } from "node:path"

import { defineCommand } from "cmdore"
import { type PluginOption, build as vite } from "vite"

import { entry } from "../arguments"
import { hasToolConfig } from "../config-files"
import { type BuildConfig, withConfig } from "../config"
import { applicationInputs, sourceRoot, writeApplicationOutput, writeBundledOutput } from "../core/node-output"
import { bundle, declaration, formats, minify, mode, outDir, sourcemap, target } from "../options"
import { logger } from "../tools"

type BuildOptions = Pick<
    BuildConfig,
    "bundle" | "declaration" | "entries" | "formats" | "minify" | "sourcemap" | "target"
>

export const build = async (
    mode: "web" | "node",
    entry: string,
    outDir: string,
    options: BuildOptions = {},
    plugins: unknown[] = []
): Promise<void> => {
    logger.start(`Building ${entry}`)

    if (mode === "web") await build.web(entry, outDir, options, plugins)
    else if (options.bundle) await build.bundle(entry, outDir, options, plugins)
    else await build.node(entry, outDir, options, plugins)

    logger.success(`Built ${entry} to ${outDir}`)
}

build.web = async (entry: string, outDir: string, options: BuildOptions, plugins: unknown[]): Promise<void> => {
    if (await hasToolConfig("vite")) {
        await vite({ root: process.cwd() })
        return
    }

    if (options.formats?.some((format) => format !== "esm")) {
        throw new Error("Web builds only support the esm format")
    }
    if (options.target != null && options.target !== "browser") {
        throw new Error("Web builds only support the browser target")
    }

    await vite({
        root: process.cwd(),
        // Users select Vite-compatible plugins for web builds in their config.
        plugins: plugins as PluginOption[],
        build: {
            outDir: resolve(process.cwd(), outDir),
            minify: options.minify,
            sourcemap: options.sourcemap,
            rolldownOptions: { input: resolve(process.cwd(), entry) }
        }
    })
}

build.node = async (entry: string, outDir: string, options: BuildOptions, plugins: unknown[]): Promise<void> => {
    if (options.declaration) throw new Error("Declarations require --bundle")
    if (options.formats?.some((format) => format !== "esm")) {
        throw new Error("CommonJS output requires --bundle")
    }

    await writeApplicationOutput({
        inputs: await applicationInputs(sourceRoot(entry)),
        minify: options.minify,
        outDir: resolve(process.cwd(), outDir),
        // Users select Rolldown-compatible plugins for Node builds in their config.
        plugins: plugins as never[],
        sourcemap: options.sourcemap,
        target: options.target
    })
}

build.bundle = async (entry: string, outDir: string, options: BuildOptions, plugins: unknown[]): Promise<void> => {
    await writeBundledOutput({
        declaration: options.declaration,
        entry,
        entries: options.entries,
        formats: options.formats,
        minify: options.minify,
        outDir: resolve(process.cwd(), outDir),
        plugins: plugins as never[],
        sourcemap: options.sourcemap,
        target: options.target
    })
}

export default defineCommand({
    name: "build",
    arguments: [entry],
    options: [mode, outDir, bundle, declaration, sourcemap, minify, formats, target],
    run: withConfig(
        (config) => config.build,
        (
            { bundle, declaration, formats, minify, mode, entry, "out-dir": outDir, sourcemap, target },
            _buildConfig,
            resolvedConfig
        ) =>
            build(
                mode,
                entry,
                outDir,
                {
                    bundle: bundle || _buildConfig.bundle,
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
