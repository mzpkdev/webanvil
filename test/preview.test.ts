import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, it } from "vitest"

import { preview } from "../src/commands/preview"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-preview-"))
    directories.push(directory)
    return directory
}

const availablePort = async (): Promise<number> =>
    new Promise((resolve, reject) => {
        const server = createServer()
        server.once("error", reject)
        server.listen(0, "127.0.0.1", () => {
            const address = server.address()
            if (address === null || typeof address === "string") {
                server.close(() => reject(new Error("Could not reserve a local port")))
                return
            }
            server.close((error) => (error === undefined ? resolve(address.port) : reject(error)))
        })
    })

const waitFor = async (url: string, expected: string): Promise<void> => {
    const timeout = Date.now() + 10_000
    while (Date.now() < timeout) {
        try {
            if ((await (await fetch(url)).text()) === expected) return
        } catch {
            // The preview server may not be listening yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`Timed out waiting for ${url}`)
}

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("preview", () => {
    it("uses Vite output settings unless the output directory is explicitly overridden", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, "vite-dist"), { recursive: true })
        await mkdir(join(directory, "webanvil-dist"), { recursive: true })
        await writeFile(join(directory, "vite.config.ts"), 'export default { build: { outDir: "vite-dist" } }')
        await writeFile(join(directory, "vite-dist", "index.html"), "vite\n")
        await writeFile(join(directory, "webanvil-dist", "index.html"), "webanvil\n")
        process.chdir(directory)
        const port = await availablePort()

        let stopVite = (): void => {}
        const viteTerminated = new Promise<void>((resolve) => {
            stopVite = resolve
        })
        const servingViteOutput = preview("webanvil-dist", "127.0.0.1", port, false, () => viteTerminated)
        await waitFor(`http://127.0.0.1:${port}`, "vite\n")
        stopVite()
        await servingViteOutput

        let stopOverride = (): void => {}
        const overrideTerminated = new Promise<void>((resolve) => {
            stopOverride = resolve
        })
        const servingOverriddenOutput = preview("webanvil-dist", "127.0.0.1", port, true, () => overrideTerminated)
        await waitFor(`http://127.0.0.1:${port}`, "webanvil\n")
        stopOverride()
        await servingOverriddenOutput
    })
})
