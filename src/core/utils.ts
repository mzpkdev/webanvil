import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { unlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { basename, dirname, join } from "pathe"

import { hasOxcConfig } from "../config-files"

const require = createRequire(import.meta.url)

type Tool = "oxfmt" | "oxlint" | "tsgo"

const tools = {
    oxfmt: { packageName: "oxfmt", executable: "oxfmt" },
    oxlint: { packageName: "oxlint", executable: "oxlint" },
    tsgo: { packageName: "@typescript/native-preview", executable: "tsgo" }
} as const

export const runTool = async (name: Tool, arguments_: string[], config?: object): Promise<void> => {
    if (name !== "tsgo" && (await hasOxcConfig(name))) config = undefined

    const tool = tools[name]
    const packageDirectory = dirname(require.resolve(`${tool.packageName}/package.json`))
    const command = join(packageDirectory, "bin", tool.executable)
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
        await new Promise<void>((resolve, reject) => {
            const child = spawn(
                process.execPath,
                [command, ...(configPath === undefined ? [] : ["--config", configPath]), ...arguments_],
                { stdio: "inherit" }
            )

            child.once("error", reject)
            child.once("exit", (code) => {
                if (code === 0) resolve()
                else reject(new Error(`${name} exited with code ${code ?? "unknown"}`))
            })
        })
    } finally {
        if (configPath !== undefined) await unlink(configPath)
    }
}
