import { randomUUID } from "node:crypto"
import { unlink, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { execa } from "execa"
import { basename, dirname, join } from "pathe"

import { hasOxcConfig } from "../config-files"

type Tool = "oxfmt" | "oxlint" | "tsgo"

const tools = {
    oxfmt: { executable: "oxfmt" },
    oxlint: { executable: "oxlint" },
    tsgo: { executable: "tsgo" }
} as const

const packageDirectory = dirname(fileURLToPath(new URL("../../package.json", import.meta.url)))

export const runTool = async (name: Tool, arguments_: string[], config?: object): Promise<void> => {
    if (name !== "tsgo" && (await hasOxcConfig(name))) config = undefined

    const tool = tools[name]
    const configPath = config === undefined ? undefined : join(process.cwd(), `.webanvil-${name}-${randomUUID()}.json`)
    const generatedConfig =
        configPath === undefined || name !== "oxfmt"
            ? config
            : {
                  ...config,
                  ignorePatterns: [
                      ...((config as { ignorePatterns?: unknown }).ignorePatterns instanceof Array
                          ? (config as { ignorePatterns: string[] }).ignorePatterns
                          : []),
                      basename(configPath)
                  ]
              }

    if (configPath !== undefined) await writeFile(configPath, `${JSON.stringify(generatedConfig)}\n`)

    try {
        const result = await execa(
            tool.executable,
            [...(configPath === undefined ? [] : ["--config", configPath]), ...arguments_],
            { localDir: packageDirectory, preferLocal: true, reject: false, stdio: "inherit" }
        )

        if (result.exitCode !== 0) throw new Error(`${name} exited with code ${result.exitCode ?? "unknown"}`)
    } finally {
        if (configPath !== undefined) await unlink(configPath)
    }
}
