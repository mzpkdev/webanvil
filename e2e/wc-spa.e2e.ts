import { access, readdir } from "node:fs/promises"
import { join } from "node:path"

import { beforeAll, describe as context, describe, expect, it } from "vitest"

import { project, npm, waitFor, webanvil } from "./utils"

const example = project("wc-spa")

describe("wc-spa", () => {
    context("when WebAnvil and the example dependencies are installed", () => {
        beforeAll(async () => {
            await npm.install(example)
        }, 60_000)

        it("lints the example with wa", async () => {
            await webanvil.lint(example)
        }, 60_000)

        it("type checks the example with wa", async () => {
            await webanvil.typecheck(example)
        }, 60_000)

        it("checks the example formatting with wa", async () => {
            await webanvil.format(example)
        }, 60_000)

        it("runs the example test suite", async () => {
            await webanvil.test(example)
        }, 60_000)

        it("builds an HTML entry with wa", async () => {
            const output = await webanvil.build(example)

            await expect(access(join(output, "index.html"))).resolves.toBeUndefined()
            await expect(readdir(join(output, "assets"))).resolves.toContainEqual(expect.stringMatching(/\.js$/))
        }, 60_000)

        it("starts a Vite development server with wa", async () => {
            const dev = webanvil.dev(example, "--host", "127.0.0.1", "--port", "4173")

            try {
                await waitFor(
                    async () => (await fetch("http://127.0.0.1:4173")).ok,
                    `Vite server did not start:\n${dev.output()}`
                )
            } finally {
                await dev.stop()
            }
        }, 60_000)
    })
})
