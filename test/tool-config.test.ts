import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { format } from "../src/commands/format"
import { lint } from "../src/commands/lint"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-tool-config-"))
    directories.push(directory)
    return directory
}

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("native tool configuration", () => {
    it("uses .oxfmtrc.json before the WebAnvil format block", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, ".oxfmtrc.json"), '{\n  "singleQuote": true\n}\n')
        await writeFile(join(directory, "source.ts"), "const greeting = 'hello';\n")
        process.chdir(directory)

        await expect(format(["source.ts"], true, { singleQuote: false })).resolves.toBeUndefined()
    })

    it("uses .oxlintrc.json before the WebAnvil lint block", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, ".oxlintrc.json"), '{ "rules": { "no-console": "deny" } }')
        await writeFile(join(directory, "source.ts"), "console.log('hello')\n")
        process.chdir(directory)

        await expect(lint(["source.ts"], false, { rules: { "no-console": "off" } })).rejects.toThrow()
    })
})
