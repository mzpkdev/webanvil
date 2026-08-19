import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { execute } from "cmdore"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/core/storybook", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../src/core/storybook")>()),
    runStorybook: vi.fn()
}))

import buildCommand from "../src/commands/build"
import devCommand from "../src/commands/dev"
import { runStorybook } from "../src/core/storybook"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-storybook-command-"))
    directories.push(directory)
    return directory
}

beforeEach(() => {
    vi.mocked(runStorybook).mockReset()
    vi.mocked(runStorybook).mockResolvedValue(undefined)
})

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("configured Storybook mode", () => {
    it.each([
        ["build", buildCommand],
        ["dev", devCommand]
    ])("uses Storybook for %s without preflighting declared Vite or Rolldown", async (name, command) => {
        const directory = await createDirectory()
        await writeFile(
            join(directory, "package.json"),
            JSON.stringify({ devDependencies: { vite: "7.0.0", rolldown: "99.0.0" } })
        )
        await writeFile(join(directory, "webanvil.config.ts"), 'export default { build: { mode: "storybook" } }')
        process.chdir(directory)

        await execute([command], { argv: [name], metadata: { name: "wa" }, onError: "throw" })

        expect(runStorybook).toHaveBeenCalledWith(
            name,
            undefined,
            name === "build" ? { outDir: undefined } : { host: undefined, port: undefined },
            expect.anything()
        )
    })
})
