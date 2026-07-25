import { resolve } from "pathe"

import { defineCommand } from "cmdore"
import type { UserConfig as ViteConfig } from "vite"

import { hasToolConfig } from "../config-files"
import { loadConfig } from "../config"
import { untilTerminated } from "../core/until-terminated"
import { useTool, useToolApi } from "../core/use-tool"
import { host, open, outDir, port } from "../options"
import { logger } from "../tools"

export const preview = async (
    outDir: string,
    host?: string,
    port?: number,
    useOutDir = false,
    waitForTermination: () => Promise<void> = untilTerminated,
    openBrowser?: boolean,
    viteConfig: ViteConfig = {}
): Promise<void> => {
    logger.start("Starting web preview")
    const vite = await useToolApi<typeof import("vite")>("vite")
    const hasViteConfig = await hasToolConfig("vite")
    const defaults: ViteConfig = {
        root: process.cwd(),
        ...(hasViteConfig ? {} : { build: { outDir: resolve(process.cwd(), outDir) } })
    }
    const native = hasViteConfig ? defaults : vite.mergeConfig(defaults, viteConfig)
    const config = vite.mergeConfig(native, {
        ...(useOutDir ? { build: { outDir: resolve(process.cwd(), outDir) } } : {}),
        preview: {
            ...(host === undefined ? {} : { host }),
            ...(port === undefined ? {} : { port }),
            ...(openBrowser === undefined ? {} : { open: openBrowser })
        }
    })
    const server = await vite.preview(config)

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
        await useTool("vite")
        const { config } = await loadConfig()
        return preview(
            outDir ?? config.build?.outDir ?? "dist",
            host,
            port,
            outDir !== undefined,
            untilTerminated,
            open,
            config.vite
        )
    }
})
