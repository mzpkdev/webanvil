import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

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
    it("returns an object config unchanged", () => {
        const config = defineConfig({ build: { outDir: "output" } })

        expect(config).toEqual({ build: { outDir: "output" } })
    })

    it("returns a config factory unchanged", () => {
        const config = defineConfig(() => ({ build: { outDir: "output" } }))

        expect(config()).toEqual({ build: { outDir: "output" } })
    })
})

describe("loadConfig", () => {
    it("loads an object config", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "webanvil.config.ts"), 'export default { build: { outDir: "output" } }')

        await expect(loadConfig(directory)).resolves.toMatchObject({
            config: { build: { outDir: "output" } },
            configFile: join(directory, "webanvil.config.ts")
        })
    })

    it("resolves a config factory", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "webanvil.config.ts"), 'export default () => ({ build: { outDir: "output" } })')

        await expect(loadConfig(directory)).resolves.toMatchObject({
            config: { build: { outDir: "output" } }
        })
    })
})
