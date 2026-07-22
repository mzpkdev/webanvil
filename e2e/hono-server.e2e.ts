import { access } from "node:fs/promises"
import { join } from "node:path"

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

const example = examplePath("hono-server")

describe("hono-server", () => {
    context("when WebAnvil and the example dependencies are installed", () => {
        beforeAll(async () => {
            await installExample(example)
        }, 60_000)

        it("lints, type checks, formats, and tests the server with wa", async () => {
            await lintExample(example)
            await typecheckExample(example)
            await checkExampleFormatting(example)
            await testExample(example)
        }, 60_000)

        it("builds the Hono server with declarations", async () => {
            const output = await buildExample(example)

            await expect(access(join(output, "server.js"))).resolves.toBeUndefined()
            await expect(access(join(output, "src", "server.d.ts"))).resolves.toBeUndefined()
        }, 60_000)
    })
})
