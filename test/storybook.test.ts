import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createStorybookTestProject, prepareStorybookConfig } from "../src/core/storybook"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-storybook-"))
    directories.push(directory)
    return directory
}

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("Storybook configuration", () => {
    it("does not load Storybook test integrations with an ordinary command", async () => {
        const loadAddon = vi.fn(() => ({ storybookTest: vi.fn() }))
        const loadBrowserProvider = vi.fn(() => ({ playwright: vi.fn() }))
        vi.resetModules()
        vi.doMock("@storybook/addon-vitest/vitest-plugin", loadAddon)
        vi.doMock("@vitest/browser-playwright", loadBrowserProvider)
        try {
            await import("../src/core/storybook")

            expect(loadAddon).not.toHaveBeenCalled()
            expect(loadBrowserProvider).not.toHaveBeenCalled()
        } finally {
            vi.doUnmock("@storybook/addon-vitest/vitest-plugin")
            vi.doUnmock("@vitest/browser-playwright")
            vi.resetModules()
        }
    })

    it("rejects a Vitest version that does not match the bundled browser provider", async () => {
        await expect(createStorybookTestProject({}, "4.1.10")).rejects.toThrow("Storybook tests require Vitest 4.1.11")
    })

    it("adds the configured framework without requiring it in the project main file", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, ".storybook"))
        await writeFile(
            join(directory, ".storybook", "main.ts"),
            'export default { stories: ["../src/**/*.stories.ts"] }\n'
        )
        await writeFile(join(directory, ".storybook", "preview.ts"), "export default {}\n")
        process.chdir(directory)

        const prepared = await prepareStorybookConfig({ framework: "svelte" })

        expect(prepared).toBeDefined()
        const generatedDirectory = prepared!.config.configDir!
        await expect(readFile(join(generatedDirectory, "main.ts"), "utf8")).resolves.toContain("framework")
        await expect(readFile(join(generatedDirectory, "main.ts"), "utf8")).resolves.toContain("storybook/svelte")
        await expect(access(join(generatedDirectory, "preview.ts"))).resolves.toBeUndefined()

        await prepared!.cleanup()

        await expect(access(generatedDirectory)).rejects.toThrow()
    })
})
