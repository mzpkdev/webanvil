import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { execute } from "cmdore"
import { afterEach, describe, describe as context, expect, it } from "vitest"
import { createUnplugin } from "unplugin"

import buildCommand, { build } from "../src/commands/build"
import { readBuildInfo } from "../src/core/build-info"
import { createNodeBuildPlan } from "../src/core/node-build"
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
        it.each([false, true])("defaults platform and target for bundle=%s", async (bundle) => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export const value = true\n")
            process.chdir(directory)

            const plan = await createNodeBuildPlan("src/index.ts", "dist", { bundle }, [])

            expect(plan.output.input.platform).toBe("node")
            expect(plan.output.input.transform).toMatchObject({ target: "node20" })
        })

        it.each([false, true])("routes platform and target independently for bundle=%s", async (bundle) => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export const value = true\n")
            process.chdir(directory)

            const plan = await createNodeBuildPlan(
                "src/index.ts",
                "dist",
                { bundle, platform: "neutral", target: ["es2022", "chrome100"] },
                []
            )

            expect(plan.output.input.platform).toBe("neutral")
            expect(plan.output.input.transform).toMatchObject({ target: ["es2022", "chrome100"] })
        })

        it("rejects a raw Vite plugin passed directly to a Node build", async () => {
            await expect(build("node", "src/index.ts", "dist", {}, [{ name: "vite-only" }])).rejects.toThrow(
                "Node builds require plugins created with definePlugin()"
            )
        })

        it("reports legacy targets through the direct Node API", async () => {
            await expect(build("node", "src/index.ts", "dist", { target: "browser" })).rejects.toThrow(
                'build.target no longer selects a platform; use build.platform: "browser" instead'
            )
        })

        it("parses CLI platform and comma-separated target overrides before planning", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export const value = true\n")
            await writeFile(
                join(directory, "webanvil.config.ts"),
                `export default {
                    build: { mode: "node", platform: "browser", target: "esnext" },
                    plugins: [{
                        vite: () => ({ name: "vite-observer" }),
                        rolldown: () => ({
                            name: "rolldown-observer",
                            options: (options) => {
                                if (options.platform !== "neutral") throw new Error("platform override was not routed")
                                if (JSON.stringify(options.transform?.target) !== JSON.stringify(["es2022", "chrome100"])) {
                                    throw new Error("target override was not routed")
                                }
                            }
                        })
                    }]
                }`
            )
            process.chdir(directory)

            await execute([buildCommand], {
                argv: ["build", "--platform", "neutral", "--target", "es2022,chrome100"],
                metadata: { name: "wa" },
                onError: "throw"
            })

            await expect(access(join(directory, "dist", "index.js"))).resolves.toBeUndefined()
        })

        it("validates CLI mode overrides before dispatch", async () => {
            const directory = await createDirectory()
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default { build: { mode: "web" }, plugins: [{ name: "vite-only" }] }'
            )
            process.chdir(directory)

            await expect(
                execute([buildCommand], {
                    argv: ["build", "--mode", "node"],
                    metadata: { name: "wa" },
                    onError: "throw"
                })
            ).rejects.toThrow("Node builds require plugins created with definePlugin()")
        })

        it.each(["browser", "neutral"] as const)("reports the platform migration for CLI target %s", async (legacy) => {
            const directory = await createDirectory()
            process.chdir(directory)

            const error = await execute([buildCommand], {
                argv: ["build", "--target", legacy],
                metadata: { name: "wa" },
                onError: "throw"
            }).catch((caught: unknown) => caught)

            expect(error).toMatchObject({
                message: `build.target no longer selects a platform; use build.platform: "${legacy}" instead`
            })
        })

        it("lets an explicit positional entry suppress configured entry mappings", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "cli.ts"), "export const cli = true\n")
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default { build: { mode: "node", bundle: true, entry: "src/configured.ts", entries: { "./configured": "src/missing.ts" } } }'
            )
            process.chdir(directory)

            await execute([buildCommand], {
                argv: ["build", "src/cli.ts"],
                metadata: { name: "wa" },
                onError: "throw"
            })

            await expect(access(join(directory, "dist", "cli.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "configured.js"))).rejects.toThrow()
        })

        it("rejects configured entries without bundled output", async () => {
            await expect(build("node", "src/index.ts", "dist", { entries: { ".": "src/index.ts" } })).rejects.toThrow(
                "Node build entries require bundle: true"
            )
        })

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

        it("keeps runtime bare imports external in source-tree output", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(
                join(directory, "src", "index.ts"),
                'import { join } from "pathe"\nexport const output = join("dist", "index.js")\n'
            )
            process.chdir(directory)

            await build("node", "src/index.ts", "dist")

            await expect(readFile(join(directory, "dist", "index.js"), "utf8")).resolves.toContain("pathe")
        })

        it("infers dual-format source trees and declarations from package metadata", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src", "lib"), { recursive: true })
            await mkdir(join(directory, "dist", "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export { greeting } from "./lib/greeting"\n')
            await writeFile(join(directory, "src", "lib", "greeting.ts"), 'export const greeting: string = "hello"\n')
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
            await writeFile(join(directory, "dist", "src", "keep.txt"), "keep\n")
            process.chdir(directory)

            await build("node", "src/index.ts", "dist")

            await expect(readFile(join(directory, "dist", "index.js"), "utf8")).resolves.toContain("./lib/greeting.js")
            await expect(readFile(join(directory, "dist", "index.cjs"), "utf8")).resolves.toContain(
                "./lib/greeting.cjs"
            )
            await expect(access(join(directory, "dist", "index.d.ts"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "lib", "greeting.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "lib", "greeting.cjs"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "lib", "greeting.d.ts"))).resolves.toBeUndefined()
            await expect(readFile(join(directory, "dist", "src", "keep.txt"), "utf8")).resolves.toBe("keep\n")
            expect((await readBuildInfo(directory)).output).toEqual([
                "dist/index.cjs",
                "dist/index.d.ts",
                "dist/index.js",
                "dist/lib/greeting.cjs",
                "dist/lib/greeting.d.ts",
                "dist/lib/greeting.js"
            ])
        })

        it("emits explicitly requested source-tree formats and declarations", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export const greeting: string = "hello"\n')
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", { declaration: true, formats: ["cjs"] })

            await expect(access(join(directory, "dist", "index.cjs"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "index.d.ts"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "index.js"))).rejects.toThrow()
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

        it("uses public JavaScript and declaration names for a renamed bundled entry", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src", "internal"), { recursive: true })
            await writeFile(
                join(directory, "src", "internal", "implementation.ts"),
                'import { statSync } from "node:fs"\n' +
                    'import { join } from "pathe"\n' +
                    "export const feature = (...parts: string[]): boolean => statSync(join(...parts)).isFile()\n"
            )
            process.chdir(directory)

            await build("node", "src/internal/implementation.ts", "dist", {
                bundle: true,
                declaration: true,
                entries: { "./feature": "src/internal/implementation.ts" }
            })

            await expect(access(join(directory, "dist", "feature.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "feature.d.ts"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "internal", "implementation.d.ts"))).rejects.toThrow()
            await expect(readFile(join(directory, "dist", "feature.js"), "utf8")).resolves.toContain("node:fs")
            await expect(readFile(join(directory, "dist", "feature.js"), "utf8")).resolves.toContain("pathe")
        })

        it("preserves declarations when public names swap source names", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export const root: "from-index" = "from-index"\n')
            await writeFile(
                join(directory, "src", "feature.ts"),
                'export const feature: "from-feature" = "from-feature"\n'
            )
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", {
                bundle: true,
                declaration: true,
                entries: { "./feature": "src/index.ts", ".": "src/feature.ts" }
            })

            await expect(readFile(join(directory, "dist", "feature.d.ts"), "utf8")).resolves.toContain("root")
            await expect(readFile(join(directory, "dist", "index.d.ts"), "utf8")).resolves.toContain("feature")
        })

        it("rejects public entry names that resolve to one source file", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "feature.ts"), "export const feature = true\n")
            process.chdir(directory)

            await expect(
                build("node", "src/feature.ts", "dist", {
                    bundle: true,
                    entries: { "./feature": "src/feature.ts", "./alias": "./src/feature.ts" }
                })
            ).rejects.toThrow("resolve to the same source file")
        })
    })

    context("with a web entry", () => {
        it("omits a web target unless one is explicit", async () => {
            const directory = await createDirectory()
            process.chdir(directory)

            const defaults = await build.webConfig("index.html", "dist", {}, [])
            const explicit = await build.webConfig("index.html", "dist", { target: ["es2022", "chrome100"] }, [])

            expect(defaults.config.build).not.toHaveProperty("target")
            expect(explicit.config.build).toMatchObject({ target: ["es2022", "chrome100"] })
        })

        it("rejects platform and legacy targets through the direct web API", async () => {
            await expect(build("web", "index.html", "dist", { platform: "browser" })).rejects.toThrow(
                "Web builds do not accept platform"
            )
            await expect(build("web", "index.html", "dist", { target: "neutral" })).rejects.toThrow(
                'build.target no longer selects a platform; use build.platform: "neutral" instead'
            )
        })

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
                    target: "es2022"
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
        it("keeps target false authoritative over a WebAnvil target", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), "globalThis.example?.value\n")
            await writeFile(
                join(directory, "vite.config.ts"),
                "export default { build: { minify: false, target: false } }"
            )
            process.chdir(directory)

            await build("web", "index.html", "dist", { target: "es2015" })

            const assets = await readdir(join(directory, "dist", "assets"))
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
            ).resolves.toContain("?.")
        })

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
