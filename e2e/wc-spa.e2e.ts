import { access, readdir } from "node:fs/promises"
import { join } from "node:path"

import { beforeAll, describe as context, describe, expect, it } from "vitest"

import { buildExample, examplePath, installExample, testExample } from "./utils"

const example = examplePath("wc-spa")

describe("wc-spa", () => {
    context("when WebAnvil and the example dependencies are installed", () => {
        beforeAll(async () => {
            await installExample(example)
        }, 60_000)

        it("runs the example test suite", async () => {
            await testExample(example)
        }, 60_000)

        it("builds an HTML entry with wa", async () => {
            const output = await buildExample(example)

            await expect(access(join(output, "index.html"))).resolves.toBeUndefined()
            await expect(readdir(join(output, "assets"))).resolves.toContainEqual(expect.stringMatching(/\.js$/))
        }, 60_000)
    })
})
