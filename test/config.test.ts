import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, describe as context, expect, it } from "vitest"

import { defineConfig, loadConfig, withConfig } from "../src/config"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-config-"))
    directories.push(directory)
    return directory
}

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("defineConfig", () => {
    context("with an object config", () => {
        it("returns the config unchanged", () => {
            const config = defineConfig({ build: { outDir: "output" } })

            expect(config).toEqual({ build: { outDir: "output" } })
        })
    })

    context("with a config factory", () => {
        it("returns the factory unchanged", () => {
            const config = defineConfig(() => ({ build: { outDir: "output" } }))

            expect(config()).toEqual({ build: { outDir: "output" } })
        })
    })
})

describe("loadConfig", () => {
    context("with an object config", () => {
        it("loads the config", async () => {
            const directory = await createDirectory()
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default { build: { outDir: "output", declaration: true, sourcemap: true, minify: false, formats: ["esm", "cjs"], target: "node20" }, format: { tabWidth: 4 }, lint: { rules: { "no-console": "deny" } }, test: { environment: "jsdom", include: ["test/**/*.test.ts"] } }'
            )

            await expect(loadConfig(directory)).resolves.toMatchObject({
                config: {
                    build: {
                        mode: "node",
                        entry: "src/index.ts",
                        outDir: "output",
                        declaration: true,
                        sourcemap: true,
                        minify: false,
                        formats: ["esm", "cjs"],
                        target: "node20"
                    },
                    format: { tabWidth: 4 },
                    lint: { rules: { "no-console": "deny" } },
                    test: { environment: "jsdom", include: ["test/**/*.test.ts"] }
                },
                configFile: join(directory, "webanvil.config.ts")
            })
        })
    })

    context("with plugins", () => {
        it("preserves them while merging built-in defaults", async () => {
            const directory = await createDirectory()
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default { build: { outDir: "output" }, plugins: [{ name: "example" }] }'
            )

            await expect(loadConfig(directory)).resolves.toMatchObject({
                config: {
                    build: { mode: "node", entry: "src/index.ts", outDir: "output" },
                    plugins: [{ name: "example" }]
                }
            })
        })
    })

    context("with a config factory", () => {
        it("resolves the returned config", async () => {
            const directory = await createDirectory()
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default () => ({ build: { outDir: "output" } })'
            )

            await expect(loadConfig(directory)).resolves.toMatchObject({
                config: { build: { outDir: "output" } }
            })
        })
    })

    context("with invalid config", () => {
        it("rejects unknown keys", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "webanvil.config.ts"), "export default { unexpected: true }")

            await expect(loadConfig(directory)).rejects.toThrow()
        })

        it("rejects invalid build options", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "webanvil.config.ts"), 'export default { build: { target: "node18" } }')

            await expect(loadConfig(directory)).rejects.toThrow()
        })

        it("rejects invalid build modes", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "webanvil.config.ts"), 'export default { build: { mode: "library" } }')

            await expect(loadConfig(directory)).rejects.toThrow()
        })

        it("rejects empty test environments", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "webanvil.config.ts"), 'export default { test: { environment: "" } }')

            await expect(loadConfig(directory)).rejects.toThrow()
        })
    })
})

describe("withConfig", () => {
    it("uses built-in defaults when no config file exists", async () => {
        const directory = await createDirectory()
        process.chdir(directory)

        const run = withConfig(
            (config) => config.build,
            async (arguments_: { entry?: string; "out-dir"?: string }) => arguments_
        )

        await expect(run({})).resolves.toEqual({
            mode: "node",
            entry: "src/index.ts",
            "out-dir": "dist"
        })
    })

    it("uses build config for missing command inputs and gives CLI inputs precedence", async () => {
        const directory = await createDirectory()
        await writeFile(
            join(directory, "webanvil.config.ts"),
            'export default { build: { mode: "web", entry: "src/config.ts", outDir: "configured-dist", sourcemap: true, minify: false, formats: ["esm"], target: "browser" } }'
        )
        process.chdir(directory)

        const run = withConfig(
            (config) => config.build,
            async (arguments_: { entry?: string; "out-dir"?: string }) => arguments_
        )

        await expect(run({ entry: "src/cli.ts" })).resolves.toEqual({
            mode: "web",
            entry: "src/cli.ts",
            "out-dir": "configured-dist",
            sourcemap: true,
            minify: false,
            formats: ["esm"],
            target: "browser"
        })
    })
})
