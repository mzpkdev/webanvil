import { access } from "node:fs/promises"
import { join } from "node:path"

import { beforeAll, describe as context, describe, expect, it } from "vitest"

import { project, npm, webanvil } from "./utils"

const example = project("hono-server")

describe("hono-server", () => {
    context("when WebAnvil and the example dependencies are installed", () => {
        beforeAll(async () => {
            await npm.install(example)
        }, 60_000)

        it("lints, type checks, formats, and tests the server with wa", async () => {
            await webanvil.lint(example)
            await webanvil.typecheck(example)
            await webanvil.format(example)
            await webanvil.test(example)
        }, 60_000)

        it("builds the Hono server as an ESM application", async () => {
            const output = await webanvil.build(example)

            await expect(access(join(output, "server.js"))).resolves.toBeUndefined()
        }, 60_000)
    })
})
