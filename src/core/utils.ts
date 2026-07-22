import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { unlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { basename, dirname, join } from "node:path"

import { hasOxcConfig } from "../config-files"

const require = createRequire(import.meta.url)

export const runTool = async (name: "oxfmt" | "oxlint", arguments_: string[], config?: object): Promise<void> => {
    if (await hasOxcConfig(name)) config = undefined

    const packageDirectory = dirname(require.resolve(`${name}/package.json`))
    const command = join(packageDirectory, "bin", name)
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
