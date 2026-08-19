import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
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

const installSvelteCheck = async (directory: string, exitCode = 0): Promise<void> => {
    const packageRoot = join(directory, "node_modules", "svelte-check")
    const executable = join(packageRoot, "bin", "svelte-check")
    await mkdir(join(packageRoot, "bin"), { recursive: true })
    await writeFile(
        join(directory, "package.json"),
        JSON.stringify({ devDependencies: { "svelte-check": "^4.0.0" } }, undefined, 4)
    )
    await writeFile(
        join(packageRoot, "package.json"),
        JSON.stringify(
            { name: "svelte-check", version: "4.0.0", bin: { "svelte-check": "./bin/svelte-check" } },
            undefined,
            4
        )
    )
    await writeFile(executable, `#!/usr/bin/env node\nprocess.exit(${exitCode})\n`)
    await chmod(executable, 0o755)
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

    it("checks every referenced project from a solution-style root", async () => {
        const directory = await createDirectory()
        await writeFile(
            join(directory, "tsconfig.json"),
            '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }'
        )
        await writeFile(
            join(directory, "tsconfig.app.json"),
            '{ "compilerOptions": { "composite": true, "strict": true }, "files": ["app.ts"] }'
        )
        await writeFile(join(directory, "app.ts"), "const greeting: string = 1\n")
        process.chdir(directory)

        await expect(typecheck([])).rejects.toThrow("tsgo exited with code 1")
    })

    it("type checks explicit paths without checking referenced projects", async () => {
        const directory = await createDirectory()
        await writeFile(
            join(directory, "tsconfig.json"),
            '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }'
        )
        await writeFile(
            join(directory, "tsconfig.app.json"),
            '{ "compilerOptions": { "composite": true, "strict": true }, "files": ["app.ts"] }'
        )
        await writeFile(join(directory, "app.ts"), "const greeting: string = 1\n")
        await writeFile(join(directory, "file.ts"), 'const greeting: string = "hello"\n')
        process.chdir(directory)

        await expect(typecheck(["file.ts"])).resolves.toBeUndefined()
    })

    it("uses declared svelte-check for a project type check", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "file.ts"), "const greeting: string = 1\n")
        await installSvelteCheck(directory)
        process.chdir(directory)

        await expect(typecheck([])).resolves.toBeUndefined()
    })

    it("reports declared svelte-check failures", async () => {
        const directory = await createDirectory()
        await installSvelteCheck(directory, 1)
        process.chdir(directory)

        await expect(typecheck([])).rejects.toThrow("svelte-check exited with code 1")
    })

    it("uses TypeScript Native for explicit paths even when svelte-check is declared", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "file.ts"), 'const greeting: string = "hello"\n')
        await installSvelteCheck(directory, 1)
        process.chdir(directory)

        await expect(typecheck(["file.ts"])).resolves.toBeUndefined()
    })
})
