import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { execute } from "cmdore"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/core/storybook", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../src/core/storybook")>()),
    runStorybook: vi.fn(),
    startStorybook: vi.fn()
}))
vi.mock("../src/core/until-terminated", () => ({ untilTerminated: vi.fn() }))

import buildCommand from "../src/commands/build"
import devCommand, { dev } from "../src/commands/dev"
import { runStorybook, startStorybook } from "../src/core/storybook"
import { untilTerminated } from "../src/core/until-terminated"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-storybook-command-"))
    directories.push(directory)
    return directory
}

const configureProject = async (): Promise<string> => {
    const directory = await createDirectory()
    await mkdir(join(directory, "src"))
    await writeFile(join(directory, "src", "index.ts"), "export const value = true\n")
    await writeFile(
        join(directory, "webanvil.config.ts"),
        'export default { build: { mode: "node" }, storybook: { framework: "svelte" } }'
    )
    process.chdir(directory)
    return directory
}

const waitFor = async (description: string, check: () => boolean): Promise<void> => {
    const timeout = Date.now() + 10_000
    while (Date.now() < timeout) {
        if (check()) return
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`Timed out waiting for ${description}`)
}

beforeEach(() => {
    vi.mocked(runStorybook).mockReset()
    vi.mocked(runStorybook).mockResolvedValue(undefined)
    vi.mocked(startStorybook).mockReset()
    vi.mocked(untilTerminated).mockReset()
    vi.mocked(untilTerminated).mockResolvedValue(undefined)
})

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("Storybook command integration", () => {
    it("builds Storybook only with --storybook", async () => {
        await configureProject()

        await execute([buildCommand], { argv: ["build"], metadata: { name: "wa" }, onError: "throw" })
        expect(runStorybook).not.toHaveBeenCalled()

        await execute([buildCommand], { argv: ["build", "--storybook"], metadata: { name: "wa" }, onError: "throw" })
        expect(runStorybook).toHaveBeenCalledWith("build", { framework: "svelte" }, {}, expect.anything())
    })

    it("starts Storybook in development only with --storybook", async () => {
        await configureProject()
        const nodeWatch = vi
            .spyOn(dev, "node")
            .mockImplementation(
                async (
                    _entry,
                    _outDir,
                    _plugins,
                    waitForTermination,
                    _options,
                    _rolldownConfig,
                    _toolchain,
                    onBuild
                ) => {
                    await onBuild?.()
                    await waitForTermination?.()
                }
            )
        let stopStorybook = (): void => {}
        const completed = new Promise<void>((resolve) => {
            stopStorybook = resolve
        })
        const stop = vi.fn()
        vi.mocked(startStorybook).mockResolvedValue({ completed, stop })

        try {
            await execute([devCommand], { argv: ["dev"], metadata: { name: "wa" }, onError: "throw" })
            expect(startStorybook).not.toHaveBeenCalled()

            let stopDevelopment = (): void => {}
            const terminated = new Promise<void>((resolve) => {
                stopDevelopment = resolve
            })
            vi.mocked(untilTerminated).mockImplementation(() => terminated)
            const storybook = execute([devCommand], {
                argv: ["dev", "--storybook"],
                metadata: { name: "wa" },
                onError: "throw"
            })
            try {
                await waitFor("Storybook development", () => vi.mocked(startStorybook).mock.calls.length === 1)
            } finally {
                stopDevelopment()
                stopStorybook()
                await storybook
            }

            expect(startStorybook).toHaveBeenCalledWith(
                "dev",
                { framework: "svelte" },
                { host: undefined, open: false, port: undefined },
                expect.anything()
            )
            expect(stop).toHaveBeenCalled()

            let stopOpenedStorybook = (): void => {}
            const openedCompleted = new Promise<void>((resolve) => {
                stopOpenedStorybook = resolve
            })
            const openedStop = vi.fn()
            vi.mocked(startStorybook).mockResolvedValue({ completed: openedCompleted, stop: openedStop })
            let stopOpenedDevelopment = (): void => {}
            const openedTerminated = new Promise<void>((resolve) => {
                stopOpenedDevelopment = resolve
            })
            vi.mocked(untilTerminated).mockImplementation(() => openedTerminated)
            const opened = execute([devCommand], {
                argv: ["dev", "--storybook", "--open"],
                metadata: { name: "wa" },
                onError: "throw"
            })
            try {
                await waitFor(
                    "Storybook development with browser opening",
                    () => vi.mocked(startStorybook).mock.calls.length === 2
                )
            } finally {
                stopOpenedDevelopment()
                stopOpenedStorybook()
                await opened
            }
            expect(startStorybook).toHaveBeenLastCalledWith(
                "dev",
                { framework: "svelte" },
                { host: undefined, open: true, port: undefined },
                expect.anything()
            )
            expect(openedStop).toHaveBeenCalled()
        } finally {
            nodeWatch.mockRestore()
        }
    })

    it.each([
        ["build", buildCommand],
        ["dev", devCommand]
    ])("requires Storybook configuration for %s --storybook", async (name, command) => {
        await expect(
            execute([command], { argv: [name, "--storybook"], metadata: { name: "wa" }, onError: "throw" })
        ).rejects.toThrow("--storybook requires a storybook configuration")
    })

    it("rejects --open without --storybook", async () => {
        await expect(
            execute([devCommand], { argv: ["dev", "--open"], metadata: { name: "wa" }, onError: "throw" })
        ).rejects.toThrow("--open is only available with --storybook")
    })

    it.each([
        ["build", buildCommand],
        ["dev", devCommand]
    ])("rejects the removed Storybook mode for %s", async (name, command) => {
        await expect(
            execute([command], { argv: [name, "--mode", "storybook"], metadata: { name: "wa" }, onError: "throw" })
        ).rejects.toThrow()
    })
})
