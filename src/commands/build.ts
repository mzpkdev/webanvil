import { resolve } from "node:path"

import { defineCommand } from "cmdore"
import { type Plugin as RolldownPlugin, rolldown } from "rolldown"
import { isolatedDeclarationPlugin } from "rolldown/experimental"
import { type PluginOption, build as vite } from "vite"

import { entry } from "../arguments"
import { type BuildConfig, withConfig } from "../config"
import { declaration, formats, minify, mode, outDir, sourcemap, target } from "../options"
import { logger } from "../tools"

type BuildOptions = Pick<BuildConfig, "declaration" | "formats" | "minify" | "sourcemap" | "target">

export const build = async (
    mode: "web" | "node",
    entry: string,
    outDir: string,
    options: BuildOptions = {},
    plugins: unknown[] = []
): Promise<void> => {
    logger.start(`Building ${entry}`)

    if (mode === "web") await build.web(entry, outDir, options, plugins)
    else await build.node(entry, outDir, options, plugins)

    logger.success(`Built ${entry} to ${outDir}`)
}

build.web = async (entry: string, outDir: string, options: BuildOptions, plugins: unknown[]): Promise<void> => {
    if (options.declaration) throw new Error("Declarations are only supported for Node builds")
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
    const input = resolve(process.cwd(), entry)
    const output = resolve(process.cwd(), outDir)
    const nodeTarget = options.target ?? "node20"

    const bundle = await rolldown({
        input,
        // Users select Rolldown-compatible plugins for Node builds in their config.
        plugins: [...(plugins as RolldownPlugin[]), ...(options.declaration ? [isolatedDeclarationPlugin()] : [])],
        platform: nodeTarget === "node20" ? "node" : nodeTarget,
        ...(nodeTarget === "node20"
            ? {
                  transform: {
                      target: nodeTarget
                  }
              }
            : {}),
        external: (id) => id.startsWith("node:") || (!id.startsWith(".") && !id.startsWith("/"))
    })
    try {
        for (const format of options.formats ?? ["esm"]) {
            await bundle.write({
                dir: output,
                cleanDir: false,
                entryFileNames: format === "esm" ? "[name].js" : "[name].cjs",
                format: format === "esm" ? "es" : "cjs",
                minify: options.minify,
                sourcemap: options.sourcemap
            })
        }
    } finally {
        await bundle.close()
    }
}

export default defineCommand({
    name: "build",
    arguments: [entry],
    options: [mode, outDir, declaration, sourcemap, minify, formats, target],
    run: withConfig(
        (config) => config.build,
        (
            { declaration, formats, minify, mode, entry, "out-dir": outDir, sourcemap, target },
            _buildConfig,
            resolvedConfig
        ) =>
            build(
                mode,
                entry,
                outDir,
                { declaration, formats, minify, sourcemap, target },
                resolvedConfig.plugins ?? []
            )
    )
})
