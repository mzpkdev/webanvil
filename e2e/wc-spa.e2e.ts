import { access, readdir } from "node:fs/promises"
import { join } from "node:path"

import { beforeAll, describe as context, describe, expect, it } from "vitest"

import {
    buildExample,
    checkExampleFormatting,
    examplePath,
    installExample,
    lintExample,
    startExample,
    stopExample,
    testExample,
    typecheckExample,
    waitFor
} from "./utils"

const example = examplePath("wc-spa")

describe("wc-spa", () => {
    context("when WebAnvil and the example dependencies are installed", () => {
        beforeAll(async () => {
            await installExample(example)
        }, 60_000)

        it("lints the example with wa", async () => {
            await lintExample(example)
        }, 60_000)

        it("type checks the example with wa", async () => {
            await typecheckExample(example)
        }, 60_000)

        it("checks the example formatting with wa", async () => {
            await checkExampleFormatting(example)
        }, 60_000)

        it("runs the example test suite", async () => {
            await testExample(example)
        }, 60_000)

        it("builds an HTML entry with wa", async () => {
            const output = await buildExample(example)

            await expect(access(join(output, "index.html"))).resolves.toBeUndefined()
            await expect(readdir(join(output, "assets"))).resolves.toContainEqual(expect.stringMatching(/\.js$/))
        }, 60_000)

        it("starts a Vite development server with wa", async () => {
            const dev = startExample(example, "--host", "127.0.0.1", "--port", "4173")

            try {
                await waitFor(
                    async () => (await fetch("http://127.0.0.1:4173")).ok,
                    `Vite server did not start:\n${dev.output()}`
                )
            } finally {
                await stopExample(dev)
            }
        }, 60_000)
    })
})
