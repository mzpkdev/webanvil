import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { format } from "../src/commands/format"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-format-"))
    directories.push(directory)
    return directory
}

const generatedConfigs = async (directory: string): Promise<string[]> =>
    readdir(join(directory, ".webanvil")).catch(() => [])

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("format", () => {
    it("passes --check on correctly formatted code", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "file.ts"), "const x = 1;\nexport { x };\n")
        process.chdir(directory)

        await expect(format(["file.ts"], true, {})).resolves.toBeUndefined()
    })

    it("fails --check on unformatted code", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "file.ts"), "const x=1\nexport {x}")
        process.chdir(directory)

        await expect(format(["file.ts"], true, {})).rejects.toThrow("oxfmt exited with code 1")
    })

    it("formats code in place", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "file.ts"), "const x=1\nexport {x}")
        process.chdir(directory)

        await expect(format(["file.ts"], false, {})).resolves.toBeUndefined()
        await expect(readFile(join(directory, "file.ts"), "utf8")).resolves.toBe("const x = 1;\nexport { x };\n")
    })

    it("does not inspect its generated config during a project scan", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "file.ts"), "export const value = 1;\n")
        process.chdir(directory)

        await expect(format([], true, { printWidth: 100 })).resolves.toBeUndefined()
        await expect(generatedConfigs(directory)).resolves.not.toContainEqual(expect.stringMatching(/^oxfmt-.*\.json$/))
    })

    it("checks and formats consumer files under .preemdeck", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, ".preemdeck", "plan"), { recursive: true })
        await writeFile(join(directory, ".preemdeck", "plan", "draft.ts"), "export  const draft=true")
        await writeFile(join(directory, "file.ts"), "export const value = 1;\n")
        process.chdir(directory)

        await expect(format([], true, {})).rejects.toThrow("oxfmt exited with code 1")
        await expect(format([], false, {})).resolves.toBeUndefined()
        await expect(readFile(join(directory, ".preemdeck", "plan", "draft.ts"), "utf8")).resolves.toBe(
            "export const draft = true;\n"
        )
        await expect(format([], true, {})).resolves.toBeUndefined()
    })

    it("keeps ignore patterns relative to the project root", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "checked.ts"), "export const checked = true;\n")
        await writeFile(join(directory, "ignored.ts"), "export  const ignored=true")
        process.chdir(directory)

        await expect(format([], true, { ignorePatterns: ["ignored.ts"] })).resolves.toBeUndefined()
    })

    it("keeps override globs relative to the project root", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "special.ts"), "export const value = 1\n")
        process.chdir(directory)

        await expect(
            format(["special.ts"], true, {
                semi: true,
                overrides: [{ files: ["special.ts"], options: { semi: false } }]
            })
        ).resolves.toBeUndefined()
    })

    it("uses unique generated configs for concurrent commands and cleans both", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "first.ts"), "export const first = 1;\n")
        await writeFile(join(directory, "second.ts"), "export const second = 2;\n")
        process.chdir(directory)

        await expect(
            Promise.all([
                format(["first.ts"], true, { printWidth: 90 }),
                format(["second.ts"], true, { printWidth: 100 })
            ])
        ).resolves.toEqual([undefined, undefined])
        await expect(generatedConfigs(directory)).resolves.not.toContainEqual(expect.stringMatching(/^oxfmt-.*\.json$/))
    })

    it("cleans its generated config after a failed command", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "file.ts"), "export  const value=1")
        process.chdir(directory)

        await expect(format(["file.ts"], true, { printWidth: 100 })).rejects.toThrow("oxfmt exited with code 1")
        await expect(generatedConfigs(directory)).resolves.not.toContainEqual(expect.stringMatching(/^oxfmt-.*\.json$/))
    })

    it("uses .oxfmtrc.json before WebAnvil configuration", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, ".oxfmtrc.json"), '{\n  "semi": true\n}\n')
        await writeFile(join(directory, "file.ts"), "const x = 1;\nexport { x };\n")
        process.chdir(directory)

        await expect(format(["file.ts"], true, { semi: false })).resolves.toBeUndefined()
        await expect(generatedConfigs(directory)).resolves.not.toContainEqual(expect.stringMatching(/^oxfmt-.*\.json$/))
    })
})
