import { resolve } from "node:path"

import { defineCommand } from "cmdore"
import { rolldown } from "rolldown"
import { build as vite } from "vite"

import { entry } from "../arguments"
import { withConfig } from "../config"
import { mode, outDir } from "../options"
import { logger } from "../tools"

export const build = async (mode: "web" | "node", entry: string, outDir: string): Promise<void> => {
    logger.start(`Building ${entry}`)

    if (mode === "web") await build.web(entry, outDir)
    else await build.node(entry, outDir)

    logger.success(`Built ${entry} to ${outDir}`)
}

build.web = async (entry: string, outDir: string): Promise<void> => {
    await vite({
        root: process.cwd(),
        build: {
            outDir: resolve(process.cwd(), outDir),
            rolldownOptions: { input: resolve(process.cwd(), entry) }
        }
    })
}

build.node = async (entry: string, outDir: string): Promise<void> => {
    const input = resolve(process.cwd(), entry)
    const output = resolve(process.cwd(), outDir)

    const bundle = await rolldown({
        input,
        external: (id) => id.startsWith("node:") || (!id.startsWith(".") && !id.startsWith("/"))
    })
    try {
        await bundle.write({ dir: output, format: "es" })
    } finally {
        await bundle.close()
    }
}

export default defineCommand({
    name: "build",
    arguments: [entry],
    options: [mode, outDir],
    run: withConfig(
        (config) => config.build,
        ({ mode, entry, "out-dir": outDir }) => build(mode, entry, outDir)
    )
})
