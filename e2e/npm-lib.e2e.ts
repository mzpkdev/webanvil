import { access } from "node:fs/promises"
import { join } from "node:path"

import { beforeAll, describe as context, describe, expect, it } from "vitest"

import { buildExample, checkExampleFormatting, examplePath, installExample, lintExample, testExample } from "./utils"

const example = examplePath("npm-lib")

describe("npm-lib", () => {
    context("when WebAnvil and the example dependencies are installed", () => {
        beforeAll(async () => {
            await installExample(example)
        }, 60_000)

        it("lints, formats, and tests the library with wa", async () => {
            await lintExample(example)
            await checkExampleFormatting(example)
            await testExample(example)
        }, 60_000)

        it("builds ESM, CommonJS, and declaration outputs", async () => {
            const output = await buildExample(example)

            await expect(access(join(output, "index.js"))).resolves.toBeUndefined()
            await expect(access(join(output, "index.cjs"))).resolves.toBeUndefined()
            await expect(access(join(output, "src", "index.d.ts"))).resolves.toBeUndefined()
        }, 60_000)
    })
})
