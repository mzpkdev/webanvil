import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
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
        it("emits a cleaned ESM file tree with rewritten relative imports", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src", "lib"), { recursive: true })
            await mkdir(join(directory, "dist"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export { greeting } from "./lib/greeting"\n')
            await writeFile(join(directory, "src", "lib", "greeting.ts"), 'export const greeting = "hello"\n')
            await writeFile(join(directory, "dist", "stale.js"), "stale\n")
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", {
                minify: true,
                sourcemap: true,
                target: "node20"
            })

            await expect(access(join(directory, "dist", "index.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "lib", "greeting.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "stale.js"))).rejects.toThrow()
            await expect(readFile(join(directory, "dist", "index.js"), "utf8")).resolves.toContain("./lib/greeting.js")
        })
    })

    context("with a bundled Node entry", () => {
        it("emits requested formats and declarations without reading package metadata", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export const greeting: string = "hello"\n')
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", {
                bundle: true,
                declaration: true,
                formats: ["esm", "cjs"]
            })

            await expect(access(join(directory, "dist", "index.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "index.cjs"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "index.d.ts"))).resolves.toBeUndefined()
        })

        it("uses configured entries for multiple public outputs", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export const root = true\n")
            await writeFile(join(directory, "src", "feature.ts"), "export const feature = true\n")
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", {
                bundle: true,
                entries: { ".": "src/index.ts", "./feature": "src/feature.ts" }
            })

            await expect(access(join(directory, "dist", "index.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "feature.js"))).resolves.toBeUndefined()
        })
    })

    context("with a web entry", () => {
        it("passes minification and source map settings to Vite", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), 'document.body.textContent = "webanvil"\n')
            process.chdir(directory)

            await build("web", "index.html", "dist", {
                bundle: true,
                declaration: true,
                formats: ["esm"],
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
