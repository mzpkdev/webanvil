import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, describe as context, expect, it } from "vitest"

import { resolvePackageOutputOptions } from "../src/core/package-options"

const directories: string[] = []

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-package-options-"))
    directories.push(directory)
    return directory
}

const writePackage = (directory: string, packageJson: object): Promise<void> =>
    writeFile(join(directory, "package.json"), JSON.stringify(packageJson))

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("resolvePackageOutputOptions", () => {
    context("with conditional package exports", () => {
        it("infers ESM, CommonJS, and declaration output", async () => {
            const directory = await createDirectory()
            await writePackage(directory, {
                exports: {
                    ".": {
                        types: "./dist/index.d.ts",
                        import: "./dist/index.js",
                        require: "./dist/index.cjs"
                    }
                }
            })

            await expect(resolvePackageOutputOptions({}, directory)).resolves.toEqual({
                declaration: true,
                formats: ["esm", "cjs"]
            })
        })

        it("finds conditions nested in export arrays and subpaths", async () => {
            const directory = await createDirectory()
            await writePackage(directory, {
                exports: {
                    ".": [{ import: "./dist/index.js" }],
                    "./feature": { require: "./dist/feature.cjs" }
                }
            })

            await expect(resolvePackageOutputOptions({}, directory)).resolves.toEqual({
                formats: ["esm", "cjs"]
            })
        })

        it("ignores root, nested, and array-contained null targets", async () => {
            const directory = await createDirectory()
            await writePackage(directory, {
                exports: {
                    ".": null,
                    "./feature": {
                        types: "./dist/feature.d.ts",
                        import: "./dist/feature.js",
                        require: "./dist/feature.cjs",
                        browser: null
                    },
                    "./fallback": [null, { development: null }, { import: "./dist/fallback.js" }]
                }
            })

            await expect(resolvePackageOutputOptions({}, directory)).resolves.toEqual({
                declaration: true,
                formats: ["esm", "cjs"]
            })
        })
    })

    it("infers declarations from the top-level types field", async () => {
        const directory = await createDirectory()
        await writePackage(directory, { types: "./dist/index.d.ts" })

        await expect(resolvePackageOutputOptions({}, directory)).resolves.toEqual({
            declaration: true
        })
    })

    it("keeps explicit output settings ahead of package metadata", async () => {
        const directory = await createDirectory()
        await writePackage(directory, {
            types: "./dist/index.d.ts",
            exports: { ".": { import: "./dist/index.js", require: "./dist/index.cjs" } }
        })

        await expect(resolvePackageOutputOptions({ declaration: false, formats: ["cjs"] }, directory)).resolves.toEqual(
            {
                declaration: false,
                formats: ["cjs"]
            }
        )
    })

    it("keeps current defaults when no package exists", async () => {
        const directory = await createDirectory()

        await expect(resolvePackageOutputOptions({}, directory)).resolves.toEqual({})
    })

    it("uses the nearest package manifest", async () => {
        const directory = await createDirectory()
        const workspacePackage = join(directory, "packages", "library")
        await mkdir(workspacePackage, { recursive: true })
        await writePackage(directory, {
            exports: { ".": { import: "./dist/index.js" } }
        })
        await writePackage(workspacePackage, {
            exports: { ".": { types: "./dist/index.d.ts", require: "./dist/index.cjs" } }
        })

        await expect(resolvePackageOutputOptions({}, workspacePackage)).resolves.toEqual({
            declaration: true,
            formats: ["cjs"]
        })
    })

    it("reports malformed package metadata", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "package.json"), "{")

        await expect(resolvePackageOutputOptions({}, directory)).rejects.toThrow()
    })
})
