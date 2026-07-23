import { resolve } from "pathe"

import { defineCommand } from "cmdore"
import { preview as vitePreview } from "vite"

import { hasToolConfig } from "../config-files"
import { loadConfig } from "../config"
import { host, open, outDir, port } from "../options"
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

export const preview = async (
    outDir: string,
    host?: string,
    port?: number,
    useOutDir = false,
    waitForTermination: () => Promise<void> = untilTerminated,
    openBrowser?: boolean
): Promise<void> => {
    logger.start("Starting web preview")
    const server = await vitePreview({
        root: process.cwd(),
        ...((await hasToolConfig("vite")) && !useOutDir ? {} : { build: { outDir: resolve(process.cwd(), outDir) } }),
        preview: { host, port, ...(openBrowser === undefined ? {} : { open: openBrowser }) }
    })

    try {
        server.printUrls()
        await waitForTermination()
    } finally {
        await server.close()
    }
}

export default defineCommand({
    name: "preview",
    options: [outDir, host, port, open],
    run: async ({ "out-dir": outDir, host, port, open }) => {
        const { config } = await loadConfig()
        return preview(
            outDir ?? config.build?.outDir ?? "dist",
            host,
            port,
            outDir !== undefined,
            untilTerminated,
            open
        )
    }
})
