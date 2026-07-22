import { access, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import { beforeAll, describe as context, describe, expect, it } from "vitest"

import {
    buildExample,
    checkExampleFormatting,
    examplePath,
    installExample,
    lintExample,
    typecheckExample
} from "./utils"

const example = examplePath("vue-spa")

describe("vue-spa", () => {
    context("when WebAnvil and the example dependencies are installed", () => {
        beforeAll(async () => {
            await installExample(example)
        }, 60_000)

        it("lints, type checks, and checks formatting with wa", async () => {
            await lintExample(example)
            await typecheckExample(example)
            await checkExampleFormatting(example)
        }, 60_000)

        it("builds a Vue application with wa", async () => {
            const output = await buildExample(example)
            const assets = await readdir(join(output, "assets"))
            const script = assets.find((asset) => asset.endsWith(".js"))

            expect(script).toBeDefined()
            if (script === undefined) throw new Error("Expected a JavaScript build asset")

            await expect(access(join(output, "index.html"))).resolves.toBeUndefined()
            await expect(readFile(join(output, "assets", script), "utf8")).resolves.toContain("WebAnvil Vue SPA")
        }, 60_000)
    })
})
