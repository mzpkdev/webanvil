import { access, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, describe as context, expect, it } from "vitest"
import type { ViteDevServer } from "vite"

import { dev } from "../src/commands/dev"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-dev-"))
    directories.push(directory)
    return directory
}

const waitForFile = async (path: string): Promise<void> => {
    const timeout = Date.now() + 10_000

    while (Date.now() < timeout) {
        if (
            await access(path)
                .then(() => true)
                .catch(() => false)
        )
            return
        await new Promise((resolve) => setTimeout(resolve, 50))
    }

    throw new Error(`Timed out waiting for ${path}`)
}

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("dev", () => {
    context("with a Node build", () => {
        it("rejects web-only host and port options", async () => {
            await expect(dev("node", "src/index.ts", "dist", "127.0.0.1", 3000)).rejects.toThrow(
                "--host and --port are only available in web development mode"
            )
        })

        it("starts and stops a watcher", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "index.ts"), 'export const greeting = "hello"\n')
            process.chdir(directory)

            let stop = (): void => {}
            const terminated = new Promise<void>((resolve) => {
                stop = resolve
            })
            const watching = dev.node("index.ts", "dist", [], () => terminated)

            await waitForFile(join(directory, "dist", "index.js"))
            stop()
            await watching
        })
    })

    context("with a web build", () => {
        it("starts and stops a Vite server", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), 'document.body.textContent = "webanvil"\n')
            process.chdir(directory)

            let stop = (): void => {}
            const terminated = new Promise<void>((resolve) => {
                stop = resolve
            })
            let listening = false
            await dev.web(
                "127.0.0.1",
                0,
                [
                    {
                        name: "observe-server",
                        configureServer: (server: ViteDevServer) => {
                            server.httpServer?.once("listening", () => {
                                listening = true
                                stop()
                            })
                        }
                    }
                ],
                () => terminated
            )

            expect(listening).toBe(true)
        })
    })
})
