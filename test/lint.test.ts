import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { lint } from "../src/commands/lint"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-lint-"))
    directories.push(directory)
    return directory
}

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("lint", () => {
    it("passes on a clean TypeScript file", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "file.ts"), 'export const greeting = "hello"\n')
        process.chdir(directory)

        await expect(lint(["file.ts"])).resolves.toBeUndefined()
    })

    it("fails when a warning is denied", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "file.ts"), "debugger\n")
        process.chdir(directory)

        await expect(lint(["file.ts"])).rejects.toThrow("oxlint exited with code 1")
    })

    it("passes --fix through to Oxlint", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "file.ts"), "const _pattern = /\\a/\n")
        process.chdir(directory)

        await expect(lint(["file.ts"], true)).resolves.toBeUndefined()
        await expect(readFile(join(directory, "file.ts"), "utf8")).resolves.toBe("const _pattern = /a/\n")
        await expect(lint(["file.ts"])).resolves.toBeUndefined()
    })

    it("uses .oxlintrc.json before WebAnvil configuration", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, ".oxlintrc.json"), '{\n  "rules": { "no-debugger": "off" }\n}\n')
        await writeFile(join(directory, "file.ts"), "debugger\n")
        process.chdir(directory)

        await expect(lint(["file.ts"], false, { rules: { "no-debugger": "deny" } })).resolves.toBeUndefined()
        await expect(readdir(directory)).resolves.not.toContainEqual(expect.stringMatching(/^\.webanvil-oxlint-/))
    })
})
