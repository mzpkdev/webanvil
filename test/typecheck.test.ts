import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { typecheck } from "../src/commands/typecheck"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-typecheck-"))
    directories.push(directory)
    return directory
}

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("typecheck", () => {
    it("passes on a valid TypeScript file", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "file.ts"), 'const greeting: string = "hello"\n')
        process.chdir(directory)

        await expect(typecheck(["file.ts"])).resolves.toBeUndefined()
    })

    it("fails on a TypeScript error", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "file.ts"), "const greeting: string = 1\n")
        process.chdir(directory)

        await expect(typecheck(["file.ts"])).rejects.toThrow("tsgo exited with code 1")
    })

    it("uses the project tsconfig", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "tsconfig.json"), '{ "compilerOptions": { "strict": true } }')
        await writeFile(join(directory, "file.ts"), "const greeting = (value) => value\n")
        process.chdir(directory)

        await expect(typecheck([])).rejects.toThrow("tsgo exited with code 1")
    })

    it("type checks explicit paths when a project tsconfig is present", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "tsconfig.json"), '{ "compilerOptions": { "strict": true } }')
        await writeFile(join(directory, "file.ts"), 'const greeting: string = "hello"\n')
        process.chdir(directory)

        await expect(typecheck(["file.ts"])).resolves.toBeUndefined()
    })
})
