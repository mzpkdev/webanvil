import { resolve } from "pathe"

import { defineCommand } from "cmdore"
import { watch } from "rolldown"
import { createServer } from "vite"

import { entry } from "../arguments"
import { hasToolConfig } from "../config-files"
import { withConfig } from "../config"
import { host, mode, outDir, port } from "../options"
import { resolveRolldownPlugins, resolveVitePlugins, type WebAnvilPlugin } from "../plugins"
import { logger } from "../tools"

const untilTerminated = (): Promise<void> =>
    new Promise((resolve) => {
        const terminate = (): void => {
            process.off("SIGINT", terminate)
            process.off("SIGTERM", terminate)
            resolve()
        }

        process.once("SIGINT", terminate)
        process.once("SIGTERM", terminate)
    })

export const dev = async (
    mode: "web" | "node",
    entry: string,
    outDir: string,
    host?: string,
    port?: number,
    plugins: WebAnvilPlugin[] = []
): Promise<void> => {
    logger.start(`Starting ${mode} development mode`)

    if (mode === "node" && (host !== undefined || port !== undefined)) {
        throw new Error("--host and --port are only available in web development mode")
    }

    if (mode === "web") await dev.web(host, port, plugins)
    else await dev.node(entry, outDir, plugins)
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
    waitForTermination: () => Promise<void> = untilTerminated
): Promise<void> => {
    const watcher = watch({
        input: resolve(process.cwd(), entry),
        plugins: resolveRolldownPlugins(plugins),
        external: (id) => id.startsWith("node:") || (!id.startsWith(".") && !id.startsWith("/")),
        output: { dir: resolve(process.cwd(), outDir), format: "es" }
    })

    watcher.on("event", async (event) => {
        if (event.code === "BUNDLE_END") {
            await event.result.close()
            logger.success(`Built ${entry} to ${outDir}`)
        }

        if (event.code === "ERROR") {
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
    options: [mode, outDir, host, port],
    run: withConfig(
        (config) => config.build,
        ({ mode, entry, "out-dir": outDir, host, port }, _buildConfig, resolvedConfig) =>
            dev(mode, entry, outDir, host, port, resolvedConfig.plugins ?? [])
    )
})
