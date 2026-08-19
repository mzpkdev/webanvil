import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { hasConfiguredStorybookMode } from "../src/config-files"

const directories: string[] = []

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-config-files-"))
    directories.push(directory)
    return directory
}

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("hasConfiguredStorybookMode", () => {
    it.each([
        ["webanvil.config.json", '{ "build": { "mode": "storybook" } }'],
        ["webanvil.config.yaml", "build:\n  mode: storybook\n"],
        [".config/webanvil.ts", 'export default { build: { mode: "storybook" } }']
    ])("detects Storybook mode in %s", async (file, source) => {
        const directory = await createDirectory()
        await mkdir(join(directory, ".config"), { recursive: true })
        await writeFile(join(directory, file), source)

        await expect(hasConfiguredStorybookMode(directory)).resolves.toBe(true)
    })

    it("ignores Storybook mode mentioned in a comment", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "webanvil.config.ts"), '// build: { mode: "storybook" }\nexport default {}')

        await expect(hasConfiguredStorybookMode(directory)).resolves.toBe(false)
    })
})
