import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, describe as context, expect, it } from "vitest"

import { defineConfig, loadConfig } from "../src/config"

const directories: string[] = []

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-config-"))
    directories.push(directory)
    return directory
}

afterEach(async () => {
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
            await writeFile(join(directory, "webanvil.config.ts"), 'export default { build: { outDir: "output" } }')

            await expect(loadConfig(directory)).resolves.toMatchObject({
                config: { build: { outDir: "output" } },
                configFile: join(directory, "webanvil.config.ts")
            })
        })
    })

    context("with a config factory", () => {
        it("resolves the returned config", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "webanvil.config.ts"), 'export default () => ({ build: { outDir: "output" } })')

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
    })
})
