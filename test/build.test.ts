import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, describe as context, expect, it } from "vitest"

import { build } from "../src/commands/build"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-build-"))
    directories.push(directory)
    return directory
}

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("build", () => {
    context("with a Node entry", () => {
        it("emits declarations, source maps, and configured formats", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "index.ts"), 'export const greeting = "hello"\n')
            process.chdir(directory)

            await build("node", "index.ts", "dist", {
                declaration: true,
                formats: ["esm", "cjs"],
                minify: true,
                sourcemap: true,
                target: "node20"
            })

            await expect(access(join(directory, "dist", "index.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "index.js.map"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "index.cjs"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "index.cjs.map"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "index.d.ts"))).resolves.toBeUndefined()
        })
    })

    context("with a web entry", () => {
        it("passes minification and source map settings to Vite", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), 'document.body.textContent = "webanvil"\n')
            process.chdir(directory)

            await build("web", "index.html", "dist", {
                minify: false,
                sourcemap: true,
                target: "browser"
            })

            const assets = await readdir(join(directory, "dist", "assets"))
            expect(assets).toContainEqual(expect.stringMatching(/\.js\.map$/))
        })
    })

    context("with a Vite config file", () => {
        it("uses the Vite build settings before WebAnvil settings", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), 'document.body.textContent = "webanvil"\n')
            await writeFile(join(directory, "vite.config.ts"), 'export default { build: { outDir: "vite-dist" } }')
            process.chdir(directory)

            await build("web", "missing.html", "webanvil-dist")

            await expect(access(join(directory, "vite-dist", "index.html"))).resolves.toBeUndefined()
            await expect(access(join(directory, "webanvil-dist"))).rejects.toThrow()
        })
    })
})
