import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { createRequire, SourceMap } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { execute } from "cmdore"
import type { Plugin as RolldownPlugin } from "rolldown"
import { afterEach, describe, describe as context, expect, it } from "vitest"
import { createUnplugin } from "unplugin"

import buildCommand, { build } from "../src/commands/build"
import { clean } from "../src/commands/clean"
import { readBuildInfo } from "../src/core/build-info"
import { createNodeBuildPlan, type NodeBuildOptions } from "../src/core/node-build"
import { definePlugin } from "../src/plugins"

const directories: string[] = []
const initialDirectory = process.cwd()
const initialNodeEnvironment = process.env.NODE_ENV
const replace = createUnplugin<{ from: string; to: string }>((options) => ({
    name: "replace",
    transform: (code) => code.replace(options.from, options.to)
}))

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-build-"))
    directories.push(directory)
    return directory
}

const installDeclaredTypeScript = async (directory: string, version: string): Promise<void> => {
    await writeFile(join(directory, "package.json"), JSON.stringify({ devDependencies: { typescript: version } }))
    await mkdir(join(directory, "node_modules", "typescript"), { recursive: true })
    await writeFile(
        join(directory, "node_modules", "typescript", "package.json"),
        JSON.stringify({ name: "typescript", version, main: "./index.js" })
    )
}

afterEach(async () => {
    process.chdir(initialDirectory)
    if (initialNodeEnvironment === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = initialNodeEnvironment
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("build", () => {
    it("preflights explicitly selected engines before evaluating project configuration", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, "node_modules", "rolldown"), { recursive: true })
        await writeFile(join(directory, "package.json"), JSON.stringify({ devDependencies: { rolldown: "99.0.0" } }))
        await writeFile(
            join(directory, "node_modules", "rolldown", "package.json"),
            JSON.stringify({ name: "rolldown", version: "99.0.0", main: "./index.js" })
        )
        await writeFile(join(directory, "node_modules", "rolldown", "index.js"), "export const rolldown = () => {}")
        await writeFile(
            join(directory, "webanvil.config.ts"),
            'import { writeFileSync } from "node:fs"; writeFileSync("config-loaded", "yes"); export default {}'
        )
        process.chdir(directory)

        await expect(
            execute([buildCommand], {
                argv: ["build", "--mode", "node"],
                metadata: { name: "wa" },
                onError: "throw"
            })
        ).rejects.toThrow("rolldown 99.0.0 is incompatible")
        await expect(access(join(directory, "config-loaded"))).rejects.toThrow()
    })

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
        it("lets --no-bundle override configured bundling", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export { value } from "./feature"\n')
            await writeFile(join(directory, "src", "feature.ts"), 'export const value = "preserved"\n')
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default { build: { mode: "node", bundle: true } }'
            )
            process.chdir(directory)

            await execute([buildCommand], {
                argv: ["build", "--no-bundle"],
                metadata: { name: "wa" },
                onError: "throw"
            })

            await expect(readFile(join(directory, "dist", "feature.js"), "utf8")).resolves.toContain("preserved")
            await expect(readFile(join(directory, "dist", "index.js"), "utf8")).resolves.toContain("./feature.js")
        })

        it.each([
            { formats: ["esm"] as const, combined: true },
            { formats: ["cjs"] as const, combined: false },
            { formats: ["esm", "cjs"] as const, combined: false }
        ])("plans declarations exactly once for $formats", async ({ formats, combined }) => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export const value: boolean = true\n")
            process.chdir(directory)

            const plan = await createNodeBuildPlan(
                "src/index.ts",
                "dist",
                { bundle: true, declaration: true, formats: [...formats] },
                []
            )
            const mainPluginNames = ((plan.output.input.plugins ?? []) as RolldownPlugin[]).map((plugin) =>
                typeof plugin === "object" && plugin !== null && "name" in plugin ? plugin.name : undefined
            )

            expect(mainPluginNames.some((name) => String(name).startsWith("rolldown-plugin-dts:"))).toBe(combined)
            expect(plan.declarationOutput !== undefined).toBe(!combined)
            if (!combined) {
                expect(plan.declarationOutput?.output).toHaveLength(1)
                expect(plan.declarationOutput?.output[0]?.format).toBe("es")
            }
        })

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
            expect(plan.output.input.transform).toMatchObject({
                target: ["es2022", "chrome100"]
            })
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

        it("accepts configured entries without bundled output", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export const value = true\n")
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", { entries: { ".": "src/index.ts" } })

            await expect(access(join(directory, "dist", "index.js"))).resolves.toBeUndefined()
        })

        it("copies static files and records them as build output", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await mkdir(join(directory, "assets", "images"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export {}\n")
            await writeFile(join(directory, "assets", "images", "logo.txt"), "logo\n")
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", {
                copy: [{ from: "assets/**", to: "assets" }]
            })

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
                build("node", "src/index.ts", "dist", {
                    copy: [{ from: "assets/index.js", to: "." }]
                })
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
                build("node", "src/index.ts", "dist", {
                    copy: [{ from: "assets/**", to: "assets" }]
                })
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

        it("keeps minified source maps aligned after removing the unused Rolldown runtime", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(
                join(directory, "src", "index.ts"),
                'import { dependency } from "./dependency"\nexport const localValue = dependency() + 1\n'
            )
            await writeFile(join(directory, "src", "dependency.ts"), "export const dependency = () => Date.now()\n")
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", { minify: true, sourcemap: true })

            const generated = await readFile(join(directory, "dist", "index.js"), "utf8")
            const generatedColumn = generated.indexOf("const")
            const map = new SourceMap(JSON.parse(await readFile(join(directory, "dist", "index.js.map"), "utf8")))
            const original = map.findEntry(0, generatedColumn)

            expect(generatedColumn).toBeGreaterThan(0)
            expect(generated).not.toContain("_rolldown/runtime")
            expect("originalSource" in original).toBe(true)
            if (!("originalSource" in original)) throw new Error("Expected a mapped generated position")
            expect(original.originalSource).toMatch(/src\/index\.ts$/)
            expect(original.originalLine).toBe(1)
        })

        it("preserves native per-format minification and source maps when WebAnvil leaves them undefined", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(
                join(directory, "src", "index.ts"),
                'export const descriptiveValue = () => "native settings"\n'
            )
            process.chdir(directory)

            await build(
                "node",
                "src/index.ts",
                "dist",
                {},
                [],
                {},
                { output: { esm: { minify: true, sourcemap: true } } }
            )

            await expect(access(join(directory, "dist", "index.js.map"))).resolves.toBeUndefined()
            await expect(readFile(join(directory, "dist", "index.js"), "utf8")).resolves.not.toContain(
                "const descriptiveValue"
            )
        })

        it("lets explicit WebAnvil false values override native per-format minification and source maps", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(
                join(directory, "src", "index.ts"),
                'export const descriptiveValue = () => "webanvil settings"\n'
            )
            process.chdir(directory)

            await build(
                "node",
                "src/index.ts",
                "dist",
                { minify: false, sourcemap: false },
                [],
                {},
                { output: { esm: { minify: true, sourcemap: true } } }
            )

            await expect(access(join(directory, "dist", "index.js.map"))).rejects.toThrow()
            await expect(readFile(join(directory, "dist", "index.js"), "utf8")).resolves.toContain(
                "const descriptiveValue"
            )
        })

        it("keeps runtime bare imports external in source-tree output", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await mkdir(join(directory, "node_modules", "pathe"), { recursive: true })
            await writeFile(
                join(directory, "src", "index.ts"),
                'import { join } from "pathe"\nexport const output = join("dist", "index.js")\n'
            )
            await writeFile(
                join(directory, "node_modules", "pathe", "package.json"),
                JSON.stringify({ name: "pathe", exports: "./index.js", type: "module" })
            )
            await writeFile(
                join(directory, "node_modules", "pathe", "index.js"),
                "export const join = (...v) => v.join('/')"
            )
            process.chdir(directory)

            await build("node", "src/index.ts", "dist")

            await expect(readFile(join(directory, "dist", "index.js"), "utf8")).resolves.toContain("pathe")
        })

        it("resolves main-field packages before externalizing neutral output", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await mkdir(join(directory, "node_modules", "main-field-package"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export { value } from "main-field-package"\n')
            await writeFile(
                join(directory, "node_modules", "main-field-package", "package.json"),
                JSON.stringify({
                    name: "main-field-package",
                    main: "./index.cjs",
                    module: "./index.js",
                    type: "module"
                })
            )
            await writeFile(
                join(directory, "node_modules", "main-field-package", "index.js"),
                'export const value = "do not bundle"\n'
            )
            await writeFile(
                join(directory, "node_modules", "main-field-package", "index.cjs"),
                'exports.value = "do not bundle"\n'
            )
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", { platform: "neutral" })

            const output = await readFile(join(directory, "dist", "index.js"), "utf8")
            expect(output).toContain('"main-field-package"')
            expect(output).not.toContain("do not bundle")
        })

        it("preserves explicit main fields for neutral output", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await mkdir(join(directory, "node_modules", "custom-field-package"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export { value } from "custom-field-package"\n')
            await writeFile(
                join(directory, "node_modules", "custom-field-package", "package.json"),
                JSON.stringify({
                    name: "custom-field-package",
                    custom: "./custom.js",
                    type: "module"
                })
            )
            await writeFile(
                join(directory, "node_modules", "custom-field-package", "custom.js"),
                'export const value = "do not bundle"\n'
            )
            process.chdir(directory)

            await build(
                "node",
                "src/index.ts",
                "dist",
                { platform: "neutral" },
                [],
                {},
                { input: { resolve: { mainFields: ["custom"] } } }
            )

            const output = await readFile(join(directory, "dist", "index.js"), "utf8")
            expect(output).toContain('"custom-field-package"')
            expect(output).not.toContain("do not bundle")
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

        it("emits only the reachable graph from multiple unbundled public entries", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src", "shared"), { recursive: true })
            await mkdir(join(directory, "src", "spec"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export { shared } from "./shared/value"\n')
            await writeFile(join(directory, "src", "feature.ts"), 'export { shared } from "./shared/value"\n')
            await writeFile(join(directory, "src", "shared", "value.ts"), "export const shared = true\n")
            await writeFile(join(directory, "src", "spec", "index.test.ts"), "throw new Error('do not emit')\n")
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", {
                entries: { ".": "src/index.ts", "./feature": "src/feature.ts" }
            })

            await expect(access(join(directory, "dist", "index.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "feature.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "shared", "value.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "spec", "index.test.js"))).rejects.toThrow()
        })

        it("resolves TypeScript paths before externalization", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src", "common"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export { value } from "@/common/value"\n')
            await writeFile(join(directory, "src", "common", "value.ts"), 'export const value = "local"\n')
            await writeFile(
                join(directory, "tsconfig.json"),
                JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } })
            )
            process.chdir(directory)

            await build("node", "src/index.ts", "dist")

            await expect(readFile(join(directory, "dist", "index.js"), "utf8")).resolves.not.toContain("@/")
            await expect(access(join(directory, "dist", "common", "value.js"))).resolves.toBeUndefined()
        })

        it("honors native resolver aliases and explicit external overrides", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export { local } from "#local"\n')
            await writeFile(join(directory, "src", "local.ts"), "export const local = true\n")
            process.chdir(directory)

            await build(
                "node",
                "src/index.ts",
                "dist",
                { bundle: true },
                [],
                {},
                {
                    input: { resolve: { alias: { "#local": join(directory, "src", "local.ts") } } }
                }
            )
            await expect(readFile(join(directory, "dist", "index.js"), "utf8")).resolves.not.toContain("#local")

            await build(
                "node",
                "src/index.ts",
                "external",
                { bundle: true },
                [],
                {},
                {
                    input: { external: ["#local"] }
                }
            )
            await expect(readFile(join(directory, "external", "index.js"), "utf8")).resolves.toContain("#local")
        })

        it("externalizes installed packages resolved through native plugins with the original specifier", async () => {
            const directory = await createDirectory()
            const defuEntry = createRequire(import.meta.url).resolve("defu")
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(
                join(directory, "src", "index.ts"),
                'export { default as mergeDefaults } from "dep-alias"\n'
            )
            process.chdir(directory)

            await build(
                "node",
                "src/index.ts",
                "dist",
                { bundle: true },
                [],
                {},
                {
                    input: {
                        plugins: [
                            {
                                name: "native-dependency-alias",
                                resolveId: {
                                    order: "pre",
                                    handler: (source) => (source === "dep-alias" ? defuEntry : null)
                                }
                            }
                        ]
                    }
                }
            )

            const output = await readFile(join(directory, "dist", "index.js"), "utf8")
            expect(output).toContain('"dep-alias"')
            expect(output).not.toContain("isPlainObject")
        })

        it("keeps virtual aliases resolved through native plugins internal", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export { value } from "virtual-alias"\n')
            process.chdir(directory)

            await build(
                "node",
                "src/index.ts",
                "dist",
                { bundle: true },
                [],
                {},
                {
                    input: {
                        plugins: [
                            {
                                name: "native-virtual-alias",
                                resolveId: (source) => (source === "virtual-alias" ? "\0native-virtual" : null),
                                load: (id) => (id === "\0native-virtual" ? 'export const value = "internal"\n' : null)
                            }
                        ]
                    }
                }
            )

            const output = await readFile(join(directory, "dist", "index.js"), "utf8")
            expect(output).not.toContain("virtual-alias")
            expect(output).toContain("internal")
        })

        it("uses ESM and browser export conditions while resolving external packages", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await mkdir(join(directory, "node_modules", "conditional"), { recursive: true })
            await mkdir(join(directory, "node_modules", "browser-only"), { recursive: true })
            await writeFile(
                join(directory, "node_modules", "conditional", "package.json"),
                JSON.stringify({
                    name: "conditional",
                    type: "module",
                    exports: { import: "./import.js" }
                })
            )
            await writeFile(join(directory, "node_modules", "conditional", "import.js"), "export const value = true\n")
            await writeFile(
                join(directory, "node_modules", "browser-only", "package.json"),
                JSON.stringify({
                    name: "browser-only",
                    type: "module",
                    exports: { browser: "./browser.js" }
                })
            )
            await writeFile(
                join(directory, "node_modules", "browser-only", "browser.js"),
                "export const browser = true\n"
            )
            await writeFile(
                join(directory, "src", "index.ts"),
                'export { value } from "conditional"\nexport { browser } from "browser-only"\n'
            )
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", { platform: "browser" })
            const output = await readFile(join(directory, "dist", "index.js"), "utf8")
            expect(output).toContain('"conditional"')
            expect(output).toContain('"browser-only"')

            await expect(build("node", "src/index.ts", "node-dist")).rejects.toThrow('Could not resolve "browser-only"')
        })

        it("fails unresolved bare imports without replacing a prior successful build", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export const value = "previous"\n')
            process.chdir(directory)
            await build("node", "src/index.ts", "dist")
            const previous = await readFile(join(directory, "dist", "index.js"), "utf8")

            await writeFile(join(directory, "src", "index.ts"), 'export { value } from "misspelled-package"\n')
            await expect(build("node", "src/index.ts", "dist")).rejects.toThrow(
                'Could not resolve "misspelled-package"'
            )

            await expect(readFile(join(directory, "dist", "index.js"), "utf8")).resolves.toBe(previous)
            expect((await readBuildInfo(directory)).output).toEqual(["dist/index.js"])
        })

        it("builds twice when output overlaps the source tree", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export const value = true\n")
            process.chdir(directory)

            await build("node", "src/index.ts", "src/generated")
            await build("node", "src/index.ts", "src/generated")

            await expect(access(join(directory, "src", "generated", "index.js"))).resolves.toBeUndefined()
            await expect(access(join(directory, "src", "generated", "generated", "index.js"))).rejects.toThrow()
        })

        it("builds declarations twice when output overlaps the project root", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "index.ts"), "export const value: boolean = true\n")
            process.chdir(directory)

            const options = {
                bundle: true,
                declaration: true,
                formats: ["esm", "cjs"]
            } satisfies NodeBuildOptions
            await build("node", "index.ts", ".", options)
            await writeFile(join(directory, "index.d.ts"), "stale tracked declaration\n")
            await build("node", "index.ts", ".", options)

            await expect(readFile(join(directory, "index.d.ts"), "utf8")).resolves.toContain(
                "declare const value: boolean"
            )
            expect((await readBuildInfo(directory)).output).toEqual(["index.cjs", "index.d.ts", "index.js"])
        })

        it("rejects an authored declaration at a planned project-root output", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "index.ts"), "export const value: boolean = true\n")
            await writeFile(join(directory, "index.d.ts"), "export declare const authored: true\n")
            process.chdir(directory)

            await expect(
                build("node", "index.ts", ".", {
                    bundle: true,
                    declaration: true,
                    formats: ["esm", "cjs"]
                })
            ).rejects.toThrow("Node generated output index.d.ts aliases authored source index.d.ts")

            await expect(readFile(join(directory, "index.d.ts"), "utf8")).resolves.toBe(
                "export declare const authored: true\n"
            )
            await expect(readBuildInfo(directory)).resolves.toEqual({ output: [] })

            await clean()

            await expect(readFile(join(directory, "index.d.ts"), "utf8")).resolves.toBe(
                "export declare const authored: true\n"
            )
        })

        it("rejects output that aliases an authored source without recording it", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.js"), 'export { value } from "./value.js"\n')
            await writeFile(join(directory, "src", "value.js"), "export const value = true\n")
            process.chdir(directory)

            await expect(build("node", "src/index.js", "src")).rejects.toThrow(
                "Node generated output src/index.js aliases authored source src/index.js"
            )

            await expect(readFile(join(directory, "src", "index.js"), "utf8")).resolves.toBe(
                'export { value } from "./value.js"\n'
            )
            await expect(readFile(join(directory, "src", "value.js"), "utf8")).resolves.toBe(
                "export const value = true\n"
            )
            await expect(readBuildInfo(directory)).resolves.toEqual({ output: [] })
        })

        it("rejects generated and copied output that aliases a reachable authored source", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await mkdir(join(directory, "assets"), { recursive: true })
            await writeFile(join(directory, "src", "index.js"), 'export { value } from "./value.js"\n')
            await writeFile(join(directory, "src", "value.js"), "export const value = true\n")
            await writeFile(join(directory, "assets", "value.js"), "copied\n")
            process.chdir(directory)

            await expect(
                build(
                    "node",
                    "src/index.js",
                    "src",
                    { bundle: true, entries: { "./value": "src/index.js" } },
                    [],
                    {},
                    { output: { esm: { entryFileNames: "[name].js" } } }
                )
            ).rejects.toThrow("Node generated output src/value.js aliases authored source src/value.js")

            await expect(
                build(
                    "node",
                    "src/index.js",
                    "src",
                    {
                        bundle: true,
                        copy: [{ from: "assets/value.js", to: "." }]
                    },
                    [],
                    {},
                    { output: { esm: { entryFileNames: "generated.js" } } }
                )
            ).rejects.toThrow("Node copied output src/value.js aliases authored source src/value.js")

            await expect(readFile(join(directory, "src", "value.js"), "utf8")).resolves.toBe(
                "export const value = true\n"
            )
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

        it("uses the regular TypeScript compiler for valid non-isolated source", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(
                join(directory, "src", "index.ts"),
                "export const greeting = (name: string) => ({ name, message: `Hello ${name}` })\n"
            )
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", {
                bundle: true,
                declaration: true
            })

            await expect(readFile(join(directory, "dist", "index.d.ts"), "utf8")).resolves.toContain("message: string")
        })

        it.each(["oxc", "tsgo"] as const)("supports the explicit %s declaration generator", async (generator) => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(
                join(directory, "src", "index.ts"),
                "export const greeting = (name: string): string => `Hello ${name}`\n"
            )
            await writeFile(
                join(directory, "tsconfig.json"),
                JSON.stringify({
                    compilerOptions: {
                        module: "esnext",
                        moduleResolution: "bundler",
                        strict: true,
                        target: "es2022"
                    },
                    include: ["src/**/*.ts"]
                })
            )
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", {
                bundle: true,
                declaration: { generator }
            })

            await expect(readFile(join(directory, "dist", "index.d.ts"), "utf8")).resolves.toContain("greeting")
        })

        it("uses Oxc declarations by default for a TypeScript 7 project without a tsconfig", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await installDeclaredTypeScript(directory, "7.0.2")
            await writeFile(
                join(directory, "src", "index.ts"),
                "export const greeting = (name: string): string => `Hello ${name}`\n"
            )
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", { bundle: true, declaration: true })

            await expect(readFile(join(directory, "dist", "index.d.ts"), "utf8")).resolves.toContain("greeting")
        })

        it("uses tsgo declarations by default for a TypeScript 7 project with a tsconfig", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await installDeclaredTypeScript(directory, "7.0.2")
            await writeFile(
                join(directory, "src", "index.ts"),
                "export const greeting = (name: string): string => `Hello ${name}`\n"
            )
            await writeFile(
                join(directory, "tsconfig.json"),
                JSON.stringify({ compilerOptions: { module: "esnext", moduleResolution: "bundler", target: "es2022" } })
            )
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", { bundle: true, declaration: true })

            await expect(readFile(join(directory, "dist", "index.d.ts"), "utf8")).resolves.toContain("greeting")
        })

        it("rejects the tsc declaration generator for TypeScript 7", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await installDeclaredTypeScript(directory, "7.0.2")
            await writeFile(join(directory, "src", "index.ts"), "export const greeting = true\n")
            process.chdir(directory)

            await expect(
                build("node", "src/index.ts", "dist", { bundle: true, declaration: { generator: "tsc" } })
            ).rejects.toThrow('build.declaration.generator "tsc" does not support TypeScript 7.0.2')
        })

        it("records declaration maps emitted through native declaration configuration", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export const value: boolean = true\n")
            process.chdir(directory)

            await build("node", "src/index.ts", "dist", {
                bundle: true,
                declaration: { sourcemap: true }
            })

            await expect(access(join(directory, "dist", "index.d.ts.map"))).resolves.toBeUndefined()
            expect((await readBuildInfo(directory)).output).toContain("dist/index.d.ts.map")
        })

        it("rejects TypeScript emit transforms for the Oxc generator", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export const value: boolean = true\n")
            await writeFile(
                join(directory, "tsconfig.json"),
                JSON.stringify({
                    compilerOptions: {
                        plugins: [{ transform: "typescript-transform-paths", afterDeclarations: true }]
                    }
                })
            )
            process.chdir(directory)

            await expect(
                build("node", "src/index.ts", "dist", {
                    bundle: true,
                    declaration: { generator: "oxc" }
                })
            ).rejects.toThrow('require build.declaration.generator "tsc"')
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
            await mkdir(join(directory, "node_modules", "pathe"), { recursive: true })
            await writeFile(
                join(directory, "src", "internal", "implementation.ts"),
                'import { statSync } from "node:fs"\n' +
                    'import { join } from "pathe"\n' +
                    "export const feature = (...parts: string[]): boolean => statSync(join(...parts)).isFile()\n"
            )
            await writeFile(
                join(directory, "node_modules", "pathe", "package.json"),
                JSON.stringify({ name: "pathe", exports: "./index.js", type: "module" })
            )
            await writeFile(
                join(directory, "node_modules", "pathe", "index.js"),
                "export const join = (...v) => v.join('/')"
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

        it("rejects public entry names that normalize to the same output name", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "root.ts"), "export const root = true\n")
            await writeFile(join(directory, "src", "index.ts"), "export const index = true\n")
            process.chdir(directory)

            await expect(
                build("node", "src/root.ts", "dist", {
                    bundle: true,
                    entries: { ".": "src/root.ts", "./index": "src/index.ts" }
                })
            ).rejects.toThrow("Node entries . and ./index normalize to the same public name: index")
        })

        it("uses native per-format output names and records actual paths", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), "export const value = true\n")
            process.chdir(directory)

            await build(
                "node",
                "src/index.ts",
                "dist",
                { bundle: true, formats: ["esm", "cjs"] },
                [],
                {},
                {
                    output: {
                        esm: { entryFileNames: (chunk) => `${chunk.name}.mjs` },
                        cjs: { entryFileNames: "[name].js" }
                    }
                }
            )

            await expect(access(join(directory, "dist", "index.mjs"))).resolves.toBeUndefined()
            await expect(access(join(directory, "dist", "index.js"))).resolves.toBeUndefined()
            expect((await readBuildInfo(directory)).output).toEqual(["dist/index.js", "dist/index.mjs"])
        })

        it("rejects cross-format collisions before replacing prior output", async () => {
            const directory = await createDirectory()
            await mkdir(join(directory, "src"), { recursive: true })
            await writeFile(join(directory, "src", "index.ts"), 'export const value = "keep"\n')
            process.chdir(directory)
            await build("node", "src/index.ts", "dist", { bundle: true })
            const previous = await readFile(join(directory, "dist", "index.js"), "utf8")

            await expect(
                build(
                    "node",
                    "src/index.ts",
                    "dist",
                    { bundle: true, formats: ["esm", "cjs"] },
                    [],
                    {},
                    {
                        output: {
                            esm: { entryFileNames: "[name].js" },
                            cjs: { entryFileNames: "[name].js" }
                        }
                    }
                )
            ).rejects.toThrow("outputs collide at index.js")

            await expect(readFile(join(directory, "dist", "index.js"), "utf8")).resolves.toBe(previous)
        })
    })

    context("with a web entry", () => {
        it("lets native Vite settings override WebAnvil config and explicit CLI settings win last", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), "document.body.textContent = 'native'\n")
            await writeFile(
                join(directory, "webanvil.config.ts"),
                `export default {
                    build: { mode: "web", entry: "index.html", outDir: "webanvil-dist", minify: true },
                    vite: { build: { outDir: "native-dist", minify: false } }
                }`
            )
            process.chdir(directory)

            await execute([buildCommand], {
                argv: ["build"],
                metadata: { name: "wa" },
                onError: "throw"
            })
            await expect(access(join(directory, "native-dist", "index.html"))).resolves.toBeUndefined()

            await execute([buildCommand], {
                argv: ["build", "--out-dir", "cli-dist", "--minify", "true"],
                metadata: { name: "wa" },
                onError: "throw"
            })
            await expect(access(join(directory, "cli-dist", "index.html"))).resolves.toBeUndefined()
        })

        it("passes the native Vite block through without cloning plugin objects", async () => {
            const directory = await createDirectory()
            const nativePlugin = { name: "native-vite-plugin" }
            process.chdir(directory)

            const resolved = await build.webConfig("index.html", "dist", {}, [], {
                base: "/questline/",
                plugins: [nativePlugin]
            })

            expect(resolved.config.base).toBe("/questline/")
            expect(resolved.config.plugins).toContain(nativePlugin)
        })

        it("lets a native Vite config file take precedence over the WebAnvil Vite block", async () => {
            const directory = await createDirectory()
            const observed: string[] = []
            await writeFile(join(directory, "vite.config.ts"), "export default { base: '/native-file/' }\n")
            process.chdir(directory)

            const resolved = await build.webConfig("index.html", "dist", {}, [], {
                base: "/webanvil-block/",
                plugins: [
                    {
                        name: "webanvil-block-observer",
                        configResolved: () => {
                            observed.push("loaded")
                        }
                    }
                ]
            })

            expect(resolved.config).not.toHaveProperty("base")
            expect(observed).toEqual([])
        })

        it("resolves a build with Vite production defaults", async () => {
            const directory = await createDirectory()
            const resolved: Array<{ mode: string; nodeEnvironment: string | undefined }> = []
            delete process.env.NODE_ENV
            process.chdir(directory)

            await build.webConfig("index.html", "dist", {}, [
                {
                    name: "resolved-environment-observer",
                    configResolved: (config) => {
                        resolved.push({ mode: config.mode, nodeEnvironment: process.env.NODE_ENV })
                    }
                }
            ])

            expect(resolved).toEqual([{ mode: "production", nodeEnvironment: "production" }])
        })

        it("preserves an explicitly supplied NODE_ENV", async () => {
            const directory = await createDirectory()
            const resolved: Array<{ mode: string; nodeEnvironment: string | undefined }> = []
            process.env.NODE_ENV = "development"
            process.chdir(directory)

            await build.webConfig("index.html", "dist", {}, [
                {
                    name: "resolved-environment-observer",
                    configResolved: (config) => {
                        resolved.push({ mode: config.mode, nodeEnvironment: process.env.NODE_ENV })
                    }
                }
            ])

            expect(resolved).toEqual([{ mode: "production", nodeEnvironment: "development" }])
        })

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
                build("web", "index.html", "dist", {
                    copy: [{ from: "assets/robots.txt", to: "." }]
                })
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

            await build("web", "index.html", "dist", {
                copy: [{ from: "assets/robots.txt", to: "." }]
            })
            await writeFile(join(directory, "public", "robots.txt"), "public\n")

            await expect(
                build("web", "index.html", "dist", {
                    copy: [{ from: "assets/robots.txt", to: "." }]
                })
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
                build("web", "index.html", "dist", {
                    copy: [{ from: "assets/robots.txt", to: "." }]
                })
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
        it("applies explicit CLI build overrides over a native Vite config file", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "index.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "alternate.html"), '<script type="module" src="/main.ts"></script>')
            await writeFile(join(directory, "main.ts"), "document.body.textContent = 'cli'\n")
            await writeFile(
                join(directory, "vite.config.ts"),
                'export default { build: { outDir: "native-dist", minify: true, sourcemap: false } }'
            )
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default { build: { mode: "web", entry: "index.html" } }'
            )
            process.chdir(directory)

            await execute([buildCommand], {
                argv: ["build", "alternate.html", "--out-dir", "cli-dist", "--minify", "false", "--sourcemap", "true"],
                metadata: { name: "wa" },
                onError: "throw"
            })

            await expect(access(join(directory, "cli-dist", "alternate.html"))).resolves.toBeUndefined()
            await expect(access(join(directory, "native-dist"))).rejects.toThrow()
            expect((await readdir(join(directory, "cli-dist", "assets"))).some((file) => file.endsWith(".map"))).toBe(
                true
            )
        })

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
