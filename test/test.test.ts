import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { startVitest } from "vitest/node"

import { test } from "../src/commands/test"
import { createStorybookTestProject } from "../src/core/storybook"

vi.mock("vitest/node", () => ({ startVitest: vi.fn() }))
vi.mock("../src/core/storybook", () => ({ createStorybookTestProject: vi.fn() }))

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-test-"))
    directories.push(directory)
    return directory
}

const createVitest = () => ({
    close: vi.fn(async () => undefined),
    state: {
        getFiles: vi.fn(() => []),
        getUnhandledErrors: vi.fn(() => [])
    }
})

beforeEach(() => {
    vi.mocked(startVitest).mockReset()
    vi.mocked(startVitest).mockResolvedValue(createVitest() as never)
    vi.mocked(createStorybookTestProject).mockReset()
    vi.mocked(createStorybookTestProject).mockResolvedValue({ extends: true, test: { name: "storybook" } })
})

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("test", () => {
    it("requires UI mode when selecting a UI port", async () => {
        await expect(test([], {}, { uiPort: 51_204 })).rejects.toThrow("--ui-port requires --ui")
    })

    it("passes the full native Vitest block unchanged", async () => {
        const directory = await createDirectory()
        process.chdir(directory)
        const sequence = { hooks: "list" as const }
        const config = {
            globals: true,
            setupFiles: ["test/setup.ts"],
            env: { FEATURE: "enabled" },
            environment: "jsdom" as const,
            include: ["test/**/*.test.ts"],
            sequence
        }

        await test(["feature"], config)

        expect(startVitest).toHaveBeenCalledWith(
            "test",
            ["feature"],
            expect.objectContaining({
                ...config,
                passWithNoTests: true,
                run: true,
                watch: false
            })
        )
        const passedConfig = vi.mocked(startVitest).mock.calls[0]?.[2]
        expect(passedConfig?.sequence).toBe(sequence)
    })

    it("applies explicit CLI values after native configuration", async () => {
        const directory = await createDirectory()
        process.chdir(directory)
        await test(
            [],
            {
                environment: "node",
                watch: false,
                coverage: { enabled: false, reportsDirectory: "coverage/custom" },
                ui: false,
                api: false
            },
            {
                coverage: true,
                environment: "jsdom",
                ui: true,
                uiPort: 51_204,
                watch: true
            },
            async () => undefined
        )

        expect(startVitest).toHaveBeenCalledWith(
            "test",
            [],
            expect.objectContaining({
                environment: "jsdom",
                run: false,
                watch: true,
                coverage: { enabled: true, provider: "v8", reportsDirectory: "coverage/custom" },
                ui: true,
                api: { host: "127.0.0.1", port: 51_204, strictPort: true }
            })
        )
    })

    it("lets a native Vitest config file take precedence over the WebAnvil block", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "vitest.config.ts"), "export default { test: { globals: false } }")
        process.chdir(directory)

        await test([], {
            globals: true,
            setupFiles: ["test/setup.ts"],
            env: { FEATURE: "enabled" },
            include: ["custom/**/*.test.ts"]
        })

        expect(startVitest).toHaveBeenCalledWith(
            "test",
            [],
            expect.not.objectContaining({
                globals: expect.anything(),
                setupFiles: expect.anything(),
                env: expect.anything(),
                include: expect.anything()
            })
        )
    })

    it("still applies an explicit CLI environment when a native config file exists", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "vitest.config.mts"), "export default { test: { environment: 'node' } }")
        process.chdir(directory)

        await test([], { environment: "happy-dom" }, { environment: "jsdom" })

        expect(startVitest).toHaveBeenCalledWith("test", [], expect.objectContaining({ environment: "jsdom" }))
    })

    it("runs Storybook stories when a Storybook config is present", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, ".storybook"))
        await writeFile(join(directory, ".storybook", "main.ts"), "export default {}")
        process.chdir(directory)

        await test([], {}, {}, undefined, { configDir: ".storybook" })

        expect(createStorybookTestProject).toHaveBeenCalledWith({ configDir: ".storybook" })
        expect(startVitest).toHaveBeenCalledWith(
            "test",
            [],
            expect.objectContaining({ projects: [{ extends: true, test: { name: "storybook" } }] })
        )
    })

    it("allows Storybook tests to be disabled in WebAnvil config", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, ".storybook"))
        await writeFile(join(directory, ".storybook", "main.ts"), "export default {}")
        process.chdir(directory)

        await test([], {}, {}, undefined, { test: false })

        expect(createStorybookTestProject).not.toHaveBeenCalled()
    })
})
