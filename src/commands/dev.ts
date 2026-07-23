import { defineCommand } from "cmdore"
import { type Plugin as RolldownPlugin, watch } from "rolldown"
import { createServer } from "vite"

import { entry } from "../arguments"
import { hasToolConfig } from "../config-files"
import { withConfig } from "../config"
import { createNodeBuildPlan, type NodeBuildOptions, nodeWatchLifecycle } from "../core/node-build"
import { untilTerminated } from "../core/until-terminated"
import { bundle, copy, declaration, formats, host, minify, mode, outDir, port, sourcemap, target } from "../options"
import { resolveRolldownPlugins, resolveVitePlugins, type WebAnvilPlugin } from "../plugins"
import { logger } from "../tools"

export const dev = async (
    mode: "web" | "node",
    entry: string,
    outDir: string,
    host?: string,
    port?: number,
    plugins: WebAnvilPlugin[] = [],
    options: NodeBuildOptions = {}
): Promise<void> => {
    logger.start(`Starting ${mode} development mode`)

    if (mode === "node" && (host !== undefined || port !== undefined)) {
        throw new Error("--host and --port are only available in web development mode")
    }

    if (mode === "web") await dev.web(host, port, plugins)
    else await dev.node(entry, outDir, plugins, untilTerminated, options)
}

dev.web = async (
    host?: string,
    port?: number,
    plugins: WebAnvilPlugin[] = [],
    waitForTermination: () => Promise<void> = untilTerminated
): Promise<void> => {
    const server = await createServer({
        root: process.cwd(),
        plugins: (await hasToolConfig("vite")) ? [] : resolveVitePlugins(plugins),
        server: { host, port }
    })

    try {
        await server.listen()
        server.printUrls()
        await waitForTermination()
    } finally {
        await server.close()
    }
}

dev.node = async (
    entry: string,
    outDir: string,
    plugins: WebAnvilPlugin[] = [],
    waitForTermination: () => Promise<void> = untilTerminated,
    options: NodeBuildOptions = {}
): Promise<void> => {
    const plan = await createNodeBuildPlan(entry, outDir, options, resolveRolldownPlugins(plugins))
    const lifecycle = nodeWatchLifecycle(plan)
    plan.output.input.plugins = [...((plan.output.input.plugins ?? []) as RolldownPlugin[]), lifecycle.plugin]
    const watcher = watch({
        ...plan.output.input,
        output: plan.output.output
    })
    let failed = false

    watcher.on("event", async (event) => {
        if (event.code === "START") {
            failed = false
            await lifecycle.start()
        }

        if (event.code === "BUNDLE_END") {
            await event.result.close()
        }

        if (event.code === "END" && !failed) {
            try {
                await lifecycle.complete()
                logger.success(`Built ${entry} to ${outDir}`)
            } catch (error) {
                logger.error(error)
            }
        }

        if (event.code === "ERROR") {
            failed = true
            lifecycle.abort()
            await event.result.close()
            logger.error(event.error)
        }
    })

    try {
        await waitForTermination()
    } finally {
        await watcher.close()
    }
}

export default defineCommand({
    name: "dev",
    arguments: [entry],
    options: [mode, outDir, host, port, bundle, copy, declaration, sourcemap, minify, formats, target],
    run: withConfig(
        (config) => config.build,
        (
            {
                bundle,
                copy,
                declaration,
                formats,
                minify,
                mode,
                entry,
                "out-dir": outDir,
                host,
                port,
                sourcemap,
                target
            },
            buildConfig,
            resolvedConfig
        ) =>
            dev(mode, entry, outDir, host, port, resolvedConfig.plugins ?? [], {
                bundle: bundle || buildConfig.bundle,
                copy,
                declaration,
                entries: buildConfig.entries,
                formats,
                minify,
                sourcemap,
                target
            })
    )
})
