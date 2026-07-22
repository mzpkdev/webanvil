import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
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

    it("uses .oxfmtrc.json before WebAnvil configuration", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, ".oxfmtrc.json"), '{\n  "semi": true\n}\n')
        await writeFile(join(directory, "file.ts"), "const x = 1;\nexport { x };\n")
        process.chdir(directory)

        await expect(format(["file.ts"], true, { semi: false })).resolves.toBeUndefined()
        await expect(readdir(directory)).resolves.not.toContainEqual(expect.stringMatching(/^\.webanvil-oxfmt-/))
    })
})
