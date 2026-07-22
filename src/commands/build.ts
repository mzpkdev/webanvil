import { access } from "node:fs/promises"
import { resolve } from "node:path"

import { defineCommand } from "cmdore"
import { rolldown } from "rolldown"

import { entry } from "../arguments"
import { outDir } from "../options"
import { logger } from "../tools"

export const build = async ({ entry, "out-dir": outDir }: { entry: string; "out-dir": string }): Promise<void> => {
    const input = resolve(process.cwd(), entry)
    const output = resolve(process.cwd(), outDir)

    await access(input)
    logger.start(`Building ${entry}`)

    const bundle = await rolldown({
        input,
        external: (id) => id.startsWith("node:") || (!id.startsWith(".") && !id.startsWith("/"))
    })
    try {
        await bundle.write({ dir: output, format: "es" })
    } finally {
        await bundle.close()
    }

    logger.success(`Built ${entry} to ${outDir}`)
}

export default defineCommand({
    name: "build",
    arguments: [entry],
    options: [outDir],
    run: build
})
