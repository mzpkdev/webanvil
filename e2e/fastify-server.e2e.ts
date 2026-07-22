import { access } from "node:fs/promises"
import { join } from "node:path"

import { beforeAll, describe as context, describe, expect, it } from "vitest"

import { buildExample, examplePath, installExample, testExample } from "./utils"

const example = examplePath("fastify-server")

describe("fastify-server", () => {
    context("when WebAnvil and the example dependencies are installed", () => {
        beforeAll(async () => {
            await installExample(example)
        }, 60_000)

        it("runs the example test suite", async () => {
            await testExample(example)
        }, 60_000)

        it("builds a Node entry with wa", async () => {
            const output = await buildExample(example)

            await expect(access(join(output, "server.js"))).resolves.toBeUndefined()
            await expect(access(join(output, "server.js.map"))).resolves.toBeUndefined()
            await expect(access(join(output, "server.cjs"))).resolves.toBeUndefined()
            await expect(access(join(output, "server.cjs.map"))).resolves.toBeUndefined()
            await expect(access(join(output, "src", "server.d.ts"))).resolves.toBeUndefined()
        }, 60_000)
    })
})
