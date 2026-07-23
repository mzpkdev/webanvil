import { access, readFile } from "node:fs/promises"
import { join } from "node:path"

import { findTypeExports, hasCJSSyntax, hasESMSyntax } from "mlly"
import { beforeAll, describe as context, describe, expect, it } from "vitest"

import { project, npm, webanvil } from "./utils"

const example = project("npm-lib")

describe("npm-lib", () => {
    context("when WebAnvil and the example dependencies are installed", () => {
        beforeAll(async () => {
            await npm.install(example)
        }, 60_000)

        it("lints, type checks, formats, and tests the library with wa", async () => {
            await webanvil.lint(example)
            await webanvil.typecheck(example)
            await webanvil.format(example)
            await webanvil.test(example)
        }, 60_000)

        it("builds ESM, CommonJS, and declaration outputs", async () => {
            await webanvil(example, "build")
            const output = example

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
            expect(esm).toContain("Hello from a plugin")
        }, 60_000)

        it("honors bundled library CLI output overrides", async () => {
            const output = await webanvil.build(
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

        it("cleans recorded bundled outputs without removing source files", async () => {
            await webanvil(example, "build")
            const output = example
            const override = await webanvil.build(
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

            await webanvil.clean(example)

            await expect(access(join(output, "index.js"))).rejects.toThrow()
            await expect(access(join(output, "feature.js"))).rejects.toThrow()
            await expect(access(join(override, "index.js"))).rejects.toThrow()
            await expect(readFile(join(example, ".webanvil", "buildinfo.json"), "utf8")).resolves.toBe(
                '{\n  "output": []\n}\n'
            )
            await expect(access(join(example, "index.ts"))).resolves.toBeUndefined()
            await expect(access(join(example, "feature.ts"))).resolves.toBeUndefined()
            await expect(access(join(example, "package.json"))).resolves.toBeUndefined()
        }, 60_000)
    })
})
