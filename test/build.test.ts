import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { execute } from "cmdore"
import { afterEach, describe, describe as context, expect, it } from "vitest"
import { createUnplugin } from "unplugin"

import buildCommand, { build } from "../src/commands/build"
import { readBuildInfo } from "../src/core/build-info"
import { definePlugin } from "../src/plugins"

const directories: string[] = []
const initialDirectory = process.cwd()
const replace = createUnplugin<{ from: string; to: string }>((options) => ({
    name: "replace",
    transform: (code) => code.replace(options.from, options.to)
}))

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
    context("with --copy", () => {
        it("keeps configured mappings when the option is absent", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await mkdir(join(directory, "assets"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export {}\n")
            await writeFile(join(directory, "assets", "configured.txt"), "configured\n")
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default { build: { copy: [{ from: "assets/**", to: "assets" }] } }'
            )
            process.chdir(directory)

            await execute([buildCommand], {
                argv: ["build"],
                metadata: { name: "wa" },
                onError: "throw"
            })

            await expect(access(join(directory, "dist", "assets", "configured.txt"))).resolves.toBeUndefined()
        })

        it("replaces configured mappings and accepts multiple values", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await mkdir(join(directory, "assets"), { recursive: true })
            await mkdir(join(directory, "templates"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export {}\n")
            await writeFile(join(directory, "assets", "configured.txt"), "configured\n")
            await writeFile(join(directory, "templates", "page.txt"), "template\n")
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default { build: { copy: [{ from: "assets/**", to: "assets" }] } }'
            )
            process.chdir(directory)

            await execute([buildCommand], {
                argv: ["build", "--copy", "templates/**=templates", "assets/**=configured"],
                metadata: { name: "wa" },
                onError: "throw"
            })

            await expect(access(join(directory, "dist", "templates", "page.txt"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "configured", "configured.txt"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "assets", "configured.txt"))).rejects.toThrow()
        })
    })

    context("with a Node entry", () => {
        it("copies static files and records them as build output", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await mkdir(join(directory, "assets", "images"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export {}\n")
            await writeFile(join(directory, "assets", "images", "logo.txt"), "logo\n")
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", { copy: [{ from: "assets/**", to: "assets" }] })

            await expect(readFile(join(directory, "dist", "assets", "images", "logo.txt"), "utf8")).resolves.toBe(
                "logo\n"
            )
            expect((await readBuildInfo(directory)).output).toEqual(["dist/assets/images/logo.txt", "dist/index.js"])
        })

        it("rejects copied paths that collide with generated output", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await mkdir(join(directory, "assets"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export {}\n")
            await writeFile(join(directory, "assets", "index.js"), "copied\n")
            process.chdir(directory)

            await expect(
                build("node", "src/index.ts", "dist", { copy: [{ from: "assets/index.js", to: "." }] })
            ).rejects.toThrow("collides with generated output")
            await expect(access(join(directory, "dist", "index.js"))).rejects.toThrow()
        })

        it("does not overwrite untracked output files", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await mkdir(join(directory, "assets"), { recursive: true })
            await mkdir(join(directory, "dist", "assets"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export {}\n")
            await writeFile(join(directory, "assets", "logo.txt"), "copied\n")
            await writeFile(join(directory, "dist", "assets", "logo.txt"), "keep\n")
            process.chdir(directory)

            await expect(
                build("node", "src/index.ts", "dist", { copy: [{ from: "assets/**", to: "assets" }] })
            ).rejects.toThrow("already exists")
            await expect(readFile(join(directory, "dist", "assets", "logo.txt"), "utf8")).resolves.toBe("keep\n")
        })

        it("emits an ESM file tree with rewritten relative imports", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src", "lib"), { recursive: true })
            await mkdir(join(directory, "dist"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export { greeting } from "./lib/greeting"\n')
            await writeFile(join(directory, "src", "lib", "greeting.ts"), 'export const greeting = "hello"\n')
            await writeFile(join(directory, "dist", "stale.js"), "stale\n")
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", { minify: true, sourcemap: true, target: "node20" }, [
                definePlugin(replace, { from: "hello", to: "goodbye" })
            ])

            await expect(access(join(directory, "dist", "index.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "lib", "greeting.js"))).resolves.toBeUndefined()
            await expect(readFile(join(directory, "dist", "stale.js"), "utf8")).resolves.toBe("stale\n")
            await expect(readFile(join(directory, "dist", "index.js"), "utf8")).resolves.toContain("./lib/greeting.js")
            await expect(readFile(join(directory, "dist", "lib", "greeting.js"), "utf8")).resolves.toContain("goodbye")
            expect((await readBuildInfo(directory)).output).toEqual([
                "dist/index.js",
                "dist/lib/greeting.js",
                "dist/lib/greeting.js.map"
            ])
        })

        it("removes prior recorded outputs without removing unrecorded siblings", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src", "lib"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export { greeting } from "./lib/greeting"\n')
            await writeFile(join(directory, "src", "lib", "greeting.ts"), 'export const greeting = "hello"\n')
            process.chdir(directory)

            await build("node", "src/index.ts", "dist")
            await writeFile(join(directory, "dist", "keep.js"), "authored\n")
            await writeFile(join(directory, "src", "index.ts"), 'export const greeting = "hello"\n')
            await rm(join(directory, "src", "lib", "greeting.ts"))
            await build("node", "src/index.ts", "dist")

            await expect(access(join(directory, "dist", "lib", "greeting.js"))).rejects.toThrow()
            await expect(readFile(join(directory, "dist", "keep.js"), "utf8")).resolves.toBe("authored\n")
        })
    })

    context("with a bundled Node entry", () => {
        it("infers bundled output settings from package metadata", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export const greeting: string = "hello"\n')
            await writeFile(
                join(directory, "package.json"),
                JSON.stringify({
                    exports: {
                        ".": {
                            types: "./dist/index.d.ts",
                            import: "./dist/index.js",
                            require: "./dist/index.cjs"
                        }
                    }
                })
            )
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", { bundle: true })

            await expect(access(join(directory, "dist", "index.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "index.cjs"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "index.d.ts"))).resolves.toBeUndefined()
        })

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
            expect((await readBuildInfo(directory)).output).toEqual([
                "dist/index.cjs",
                "dist/index.d.ts",
                "dist/index.js"
            ])
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
        it("retains Vite output cleanup when no static copies are configured", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "dist"), { recursive: true })
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), 'document.body.textContent = "webanvil"\n')
            await writeFile(join(directory, "dist", "stale.txt"), "stale\n")
            process.chdir(directory)

            await build("web", "index.html", "dist")

            await expect(access(join(directory, "dist", "stale.txt"))).rejects.toThrow()
        })

        it("does not overwrite untracked output files", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "assets"), { recursive: true })
            await mkdir(join(directory, "dist", "assets"), { recursive: true })
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), 'document.body.textContent = "webanvil"\n')
            await writeFile(join(directory, "assets", "logo.txt"), "copied\n")
            await writeFile(join(directory, "dist", "assets", "logo.txt"), "keep\n")
            process.chdir(directory)

            await expect(
                build("web", "index.html", "dist", { copy: [{ from: "assets/**", to: "assets" }] })
            ).rejects.toThrow("already exists")
            await expect(readFile(join(directory, "dist", "assets", "logo.txt"), "utf8")).resolves.toBe("keep\n")
        })

        it("rejects Vite configs that re-enable output cleanup", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "assets"), { recursive: true })
            await mkdir(join(directory, "dist", "assets"), { recursive: true })
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), 'document.body.textContent = "webanvil"\n')
            await writeFile(join(directory, "assets", "logo.txt"), "copied\n")
            await writeFile(join(directory, "dist", "assets", "logo.txt"), "keep\n")
            await writeFile(
                join(directory, "vite.config.ts"),
                "export default { plugins: [{ name: 'enable-output-cleanup', config: () => ({ build: { emptyOutDir: true } }) }] }"
            )
            process.chdir(directory)

            await expect(
                build("web", "index.html", "dist", { copy: [{ from: "assets/**", to: "assets" }] })
            ).rejects.toThrow("build.emptyOutDir")
            await expect(readFile(join(directory, "dist", "assets", "logo.txt"), "utf8")).resolves.toBe("keep\n")
        })

        it("does not overwrite untracked output files copied from Vite public", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "assets"), { recursive: true })
            await mkdir(join(directory, "public"), { recursive: true })
            await mkdir(join(directory, "dist"), { recursive: true })
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), 'document.body.textContent = "webanvil"\n')
            await writeFile(join(directory, "assets", "robots.txt"), "copied\n")
            await writeFile(join(directory, "public", "robots.txt"), "public\n")
            await writeFile(join(directory, "dist", "robots.txt"), "keep\n")
            process.chdir(directory)

            await expect(
                build("web", "index.html", "dist", { copy: [{ from: "assets/robots.txt", to: "." }] })
            ).rejects.toThrow("collides with generated output")
            await expect(readFile(join(directory, "dist", "robots.txt"), "utf8")).resolves.toBe("keep\n")
        })

        it("rejects a Vite public collision before replacing prior copied output", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "assets"), { recursive: true })
            await mkdir(join(directory, "public"), { recursive: true })
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), 'document.body.textContent = "webanvil"\n')
            await writeFile(join(directory, "assets", "robots.txt"), "copied\n")
            process.chdir(directory)

            await build("web", "index.html", "dist", { copy: [{ from: "assets/robots.txt", to: "." }] })
            await writeFile(join(directory, "public", "robots.txt"), "public\n")

            await expect(
                build("web", "index.html", "dist", { copy: [{ from: "assets/robots.txt", to: "." }] })
            ).rejects.toThrow("collides with generated output")
            await expect(readFile(join(directory, "dist", "robots.txt"), "utf8")).resolves.toBe("copied\n")
        })

        it("rejects copied paths that collide with Vite public output", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "assets"), { recursive: true })
            await mkdir(join(directory, "public"), { recursive: true })
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), 'document.body.textContent = "webanvil"\n')
            await writeFile(join(directory, "assets", "robots.txt"), "copied\n")
            await writeFile(join(directory, "public", "robots.txt"), "public\n")
            process.chdir(directory)

            await expect(
                build("web", "index.html", "dist", { copy: [{ from: "assets/robots.txt", to: "." }] })
            ).rejects.toThrow("collides with generated output")
        })

        it("passes minification and source map settings to Vite", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "public"))
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), 'document.body.textContent = "webanvil"\n')
            await writeFile(join(directory, "public", "robots.txt"), "User-agent: *\n")
            process.chdir(directory)

            await build(
                "web",
                "index.html",
                "dist",
                {
                    bundle: true,
                    declaration: true,
                    formats: ["esm"],
                    minify: false,
                    sourcemap: true,
                    target: "browser"
                },
                [definePlugin(replace, { from: "webanvil", to: "unplugin" })]
            )

            const assets = await readdir(join(directory, "dist", "assets"))
            expect(assets).toContainEqual(expect.stringMatching(/\.js\.map$/))
            await expect(
                readFile(
                    join(
                        directory,
                        "dist",
                        "assets",
                        assets.find((asset) => asset.endsWith(".js"))!
                    ),
                    "utf8"
                )
            ).resolves.toContain("unplugin")
            const output = (await readBuildInfo(directory)).output
            expect(output).toContain("dist/index.html")
            expect(output).toContain("dist/robots.txt")
            expect(output.some((file) => file.startsWith("dist/assets/"))).toBe(true)
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
            expect((await readBuildInfo(directory)).output).toContain("vite-dist/index.html")
        })
    })
})
