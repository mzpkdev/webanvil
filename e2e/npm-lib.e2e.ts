import { access, readFile } from "node:fs/promises"
import { join } from "node:path"

import { findTypeExports, hasCJSSyntax, hasESMSyntax } from "mlly"
import { beforeAll, describe as context, describe, expect, it } from "vitest"

import {
    buildExample,
    checkExampleFormatting,
    examplePath,
    installExample,
    lintExample,
    testExample,
    typecheckExample
} from "./utils"

const example = examplePath("npm-lib")

describe("npm-lib", () => {
    context("when WebAnvil and the example dependencies are installed", () => {
        beforeAll(async () => {
            await installExample(example)
        }, 60_000)

        it("lints, type checks, formats, and tests the library with wa", async () => {
            await lintExample(example)
            await typecheckExample(example)
            await checkExampleFormatting(example)
            await testExample(example)
        }, 60_000)

        it("builds ESM, CommonJS, and declaration outputs", async () => {
            const output = await buildExample(example)

            await expect(access(join(output, "index.js"))).resolves.toBeUndefined()
            await expect(access(join(output, "index.cjs"))).resolves.toBeUndefined()
            await expect(access(join(output, "index.d.ts"))).resolves.toBeUndefined()

            const esm = await readFile(join(output, "index.js"), "utf8")
            const cjs = await readFile(join(output, "index.cjs"), "utf8")
            const declaration = await readFile(join(output, "index.d.ts"), "utf8")

            expect(hasESMSyntax(esm)).toBe(true)
            expect(hasCJSSyntax(esm)).toBe(false)
            expect(hasCJSSyntax(cjs)).toBe(true)
            expect(findTypeExports(declaration).flatMap((entry) => entry.names)).toContain("greet")
        }, 60_000)

        it("honors bundled library CLI output overrides", async () => {
            const output = await buildExample(
                example,
                "cli-dist",
                "--bundle",
                "--out-dir",
                "cli-dist",
                "--formats",
                "esm",
                "--declaration",
                "false"
            )
            const esm = await readFile(join(output, "index.js"), "utf8")

            expect(hasESMSyntax(esm)).toBe(true)
            await expect(access(join(output, "index.cjs"))).rejects.toThrow()
            await expect(access(join(output, "index.d.ts"))).rejects.toThrow()
        }, 60_000)
    })
})
