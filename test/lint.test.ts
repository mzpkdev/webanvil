import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
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

const generatedConfigs = async (directory: string): Promise<string[]> =>
    readdir(join(directory, ".webanvil")).catch(() => [])

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

    it("lints consumer files under .preemdeck", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, ".preemdeck", "plan"), { recursive: true })
        await writeFile(join(directory, ".preemdeck", "plan", "draft.ts"), "debugger\n")
        await writeFile(join(directory, "file.ts"), 'export const greeting = "hello"\n')
        process.chdir(directory)

        await expect(lint([], false, { rules: { "no-debugger": "deny" } })).rejects.toThrow("oxlint exited with code 1")
    })

    it("keeps ignore patterns relative to the project root", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "checked.ts"), 'export const greeting = "hello"\n')
        await writeFile(join(directory, "ignored.ts"), "debugger\n")
        process.chdir(directory)

        await expect(lint([], false, { ignorePatterns: ["ignored.ts"] })).resolves.toBeUndefined()
        await expect(generatedConfigs(directory)).resolves.not.toContainEqual(
            expect.stringMatching(/^oxlint-.*\.json$/)
        )
    })

    it("keeps override globs relative to the project root", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "special.ts"), "debugger\n")
        process.chdir(directory)

        await expect(
            lint(["special.ts"], false, {
                rules: { "no-debugger": "deny" },
                overrides: [{ files: ["special.ts"], rules: { "no-debugger": "off" } }]
            })
        ).resolves.toBeUndefined()
    })

    it("keeps extended config paths relative to the project root", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "base.json"), '{ "rules": { "no-debugger": "off" } }\n')
        await writeFile(join(directory, "file.ts"), "debugger\n")
        process.chdir(directory)

        await expect(lint(["file.ts"], false, { extends: ["./base.json"] })).resolves.toBeUndefined()
    })

    it("uses unique generated configs for concurrent commands and cleans both", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "first.ts"), 'export const first = "one"\n')
        await writeFile(join(directory, "second.ts"), 'export const second = "two"\n')
        process.chdir(directory)

        await expect(
            Promise.all([
                lint(["first.ts"], false, { rules: { "no-debugger": "deny" } }),
                lint(["second.ts"], false, { rules: { "no-console": "deny" } })
            ])
        ).resolves.toEqual([undefined, undefined])
        await expect(generatedConfigs(directory)).resolves.not.toContainEqual(
            expect.stringMatching(/^oxlint-.*\.json$/)
        )
    })

    it("cleans its generated config after a failed command", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "file.ts"), "debugger\n")
        process.chdir(directory)

        await expect(lint(["file.ts"], false, { rules: { "no-debugger": "deny" } })).rejects.toThrow(
            "oxlint exited with code 1"
        )
        await expect(generatedConfigs(directory)).resolves.not.toContainEqual(
            expect.stringMatching(/^oxlint-.*\.json$/)
        )
    })

    it("uses .oxlintrc.json before WebAnvil configuration", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, ".oxlintrc.json"), '{\n  "rules": { "no-debugger": "off" }\n}\n')
        await writeFile(join(directory, "file.ts"), "debugger\n")
        process.chdir(directory)

        await expect(lint(["file.ts"], false, { rules: { "no-debugger": "deny" } })).resolves.toBeUndefined()
        await expect(generatedConfigs(directory)).resolves.not.toContainEqual(
            expect.stringMatching(/^oxlint-.*\.json$/)
        )
    })
})
