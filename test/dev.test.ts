import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, describe as context, expect, it } from "vitest"
import type { ViteDevServer } from "vite"

import { dev } from "../src/commands/dev"
import { readBuildInfo, writeBuildInfo } from "../src/core/build-info"

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

const waitFor = async (description: string, check: () => boolean | Promise<boolean>): Promise<void> => {
    const timeout = Date.now() + 10_000

    while (Date.now() < timeout) {
        if (await check()) return
        await new Promise((resolve) => setTimeout(resolve, 50))
    }

    throw new Error(`Timed out waiting for ${description}`)
}

const exists = (path: string): Promise<boolean> =>
    access(path)
        .then(() => true)
        .catch(() => false)

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

        it("keeps bundled library output in parity with one-shot builds", { timeout: 20_000 }, async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await mkdir(join(directory, "assets"), { recursive: true })
            await mkdir(join(directory, "dist"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export const greeting: string = "hello"\n')
            await writeFile(join(directory, "src", "feature.ts"), "export const feature = true\n")
            await writeFile(join(directory, "assets", "message.txt"), "first\n")
            await writeFile(join(directory, "dist", "stale.js"), "stale\n")
            await writeBuildInfo(["dist/stale.js"], directory)
            process.chdir(directory)

            let stop = (): void => {}
            const terminated = new Promise<void>((resolve) => {
                stop = resolve
            })
            const watching = dev.node("src/index.ts", "dist", [], () => terminated, {
                bundle: true,
                copy: [{ from: "assets/**", to: "assets" }],
                declaration: true,
                entries: { ".": "src/index.ts", "./feature": "src/feature.ts" },
                formats: ["esm", "cjs"],
                sourcemap: true
            })

            try {
                const expected = [
                    "dist/assets/message.txt",
                    "dist/feature.cjs",
                    "dist/feature.cjs.map",
                    "dist/feature.d.ts",
                    "dist/feature.js",
                    "dist/feature.js.map",
                    "dist/index.cjs",
                    "dist/index.cjs.map",
                    "dist/index.d.ts",
                    "dist/index.js",
                    "dist/index.js.map"
                ]
                await waitFor("the complete watched library build", async () => {
                    const filesExist = (await Promise.all(expected.map((file) => exists(join(directory, file))))).every(
                        Boolean
                    )
                    return (
                        filesExist &&
                        JSON.stringify((await readBuildInfo(directory)).output) === JSON.stringify(expected)
                    )
                })
                await expect(access(join(directory, "dist", "stale.js"))).rejects.toThrow()
                expect((await readBuildInfo(directory)).output).toEqual(expected)

                await writeFile(join(directory, "src", "index.ts"), "export const greeting: number = 42\n")
                await writeFile(join(directory, "assets", "message.txt"), "second\n")
                await waitFor(
                    "updated JavaScript, declarations, and copied assets",
                    async () =>
                        (await readFile(join(directory, "dist", "index.js"), "utf8")).includes("42") &&
                        (await readFile(join(directory, "dist", "index.d.ts"), "utf8")).includes("number") &&
                        (await readFile(join(directory, "dist", "assets", "message.txt"), "utf8")) === "second\n"
                )

                await writeFile(join(directory, "assets", "added.txt"), "added\n")
                await writeFile(
                    join(directory, "src", "feature.ts"),
                    "export const feature = true\nexport const added = true\n"
                )
                await waitFor(
                    "the newly matched copied output",
                    async () =>
                        (await exists(join(directory, "dist", "assets", "added.txt"))) &&
                        (await readBuildInfo(directory)).output.includes("dist/assets/added.txt")
                )

                await rm(join(directory, "assets", "message.txt"))
                await waitFor(
                    "removed copied output",
                    async () =>
                        !(await exists(join(directory, "dist", "assets", "message.txt"))) &&
                        !(await readBuildInfo(directory)).output.includes("dist/assets/message.txt")
                )
            } finally {
                stop()
                await watching
            }
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
