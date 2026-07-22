import { access, readFile, rm, stat, writeFile } from "node:fs/promises"
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
    waitFor,
    waitForFile
} from "./utils"

const example = examplePath("fastify-server")

describe("fastify-server", () => {
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

        it("builds a Node entry with wa", async () => {
            const output = await buildExample(example)

            await expect(access(join(output, "server.js"))).resolves.toBeUndefined()
        }, 60_000)

        it("watches, reports build errors, and recovers with wa", async () => {
            const source = join(example, "src", "server.ts")
            const output = join(example, "dist", "server.js")
            const original = await readFile(source, "utf8")
            await rm(output, { force: true })
            const dev = startExample(example)

            try {
                await waitForFile(output)
                const initialOutputTime = (await stat(output)).mtimeMs
                await writeFile(source, "export const broken =")
                await waitFor(
                    async () => dev.child.exitCode === null && /error/i.test(dev.output()),
                    `Watcher did not report an error:\n${dev.output()}`
                )
                await writeFile(source, original)
                await waitFor(
                    async () => (await stat(output)).mtimeMs > initialOutputTime,
                    `Watcher did not rebuild after the error:\n${dev.output()}`
                )
            } finally {
                await writeFile(source, original)
                await stopExample(dev)
            }
        }, 60_000)
    })
})
