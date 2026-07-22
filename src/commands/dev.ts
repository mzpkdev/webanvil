import { resolve } from "node:path"

import { defineCommand } from "cmdore"
import { watch } from "rolldown"
import { createServer } from "vite"

import { entry } from "../arguments"
import { withConfig } from "../config"
import { host, mode, outDir, port } from "../options"
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
    port?: number
): Promise<void> => {
    logger.start(`Starting ${mode} development mode`)

    if (mode === "node" && (host !== undefined || port !== undefined)) {
        throw new Error("--host and --port are only available in web development mode")
    }

    if (mode === "web") await dev.web(host, port)
    else await dev.node(entry, outDir)
}

dev.web = async (host?: string, port?: number): Promise<void> => {
    const server = await createServer({
        root: process.cwd(),
        server: { host, port }
    })

    try {
        await server.listen()
        server.printUrls()
        await untilTerminated()
    } finally {
        await server.close()
    }
}

dev.node = async (entry: string, outDir: string): Promise<void> => {
    const watcher = watch({
        input: resolve(process.cwd(), entry),
        external: (id) => id.startsWith("node:") || (!id.startsWith(".") && !id.startsWith("/")),
        output: { dir: resolve(process.cwd(), outDir), format: "es" },
        experimental: { incrementalBuild: true }
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
        await untilTerminated()
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
        ({ mode, entry, "out-dir": outDir, host, port }) => dev(mode, entry, outDir, host, port)
    )
})
