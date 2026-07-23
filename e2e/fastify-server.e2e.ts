import { access, readFile, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { hasCJSSyntax, hasESMSyntax } from "mlly"
import { beforeAll, describe as context, describe, expect, it } from "vitest"

import { project, npm, waitFor, waitForFile, webanvil } from "./utils"

const example = project("fastify-server")

describe("fastify-server", () => {
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

        it("builds a Node entry with wa", async () => {
            const output = await webanvil.build(example)

            await expect(access(join(output, "server.js"))).resolves.toBeUndefined()
        }, 60_000)

        it("honors Node CLI output overrides and emits an ESM module", async () => {
            const output = await webanvil.build(
                example,
                "cli-dist",
                "--out-dir",
                "cli-dist",
                "--minify",
                "false",
                "--sourcemap",
                "false"
            )
            const server = await readFile(join(output, "server.js"), "utf8")

            expect(hasESMSyntax(server)).toBe(true)
            expect(hasCJSSyntax(server)).toBe(false)
            await expect(access(join(output, "server.js.map"))).rejects.toThrow()
        }, 60_000)

        it("watches, reports build errors, and recovers with wa", async () => {
            const source = join(example, "src", "server.ts")
            const output = join(example, "dist", "server.js")
            const original = await readFile(source, "utf8")
            await rm(output, { force: true })
            const dev = webanvil.dev(example)

            try {
                await waitForFile(output)
                const initialOutputTime = (await stat(output)).mtimeMs
                await writeFile(source, "export const broken =")
                await waitFor(
                    async () => /error/i.test(dev.output()),
                    `Watcher did not report an error:\n${dev.output()}`
                )
                await writeFile(source, original)
                await waitFor(
                    async () => (await stat(output)).mtimeMs > initialOutputTime,
                    `Watcher did not rebuild after the error:\n${dev.output()}`
                )
            } finally {
                await writeFile(source, original)
                await dev.stop()
            }
        }, 60_000)
    })
})
