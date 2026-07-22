import { access, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import { beforeAll, describe as context, describe, expect, it } from "vitest"

import { buildExample, examplePath, installExample } from "./utils"

const example = examplePath("react-spa")

describe("react-spa", () => {
    context("when WebAnvil and the example dependencies are installed", () => {
        beforeAll(async () => {
            await installExample(example)
        }, 60_000)

        it("builds a JSX entry with wa", async () => {
            const output = await buildExample(example)
            const assets = await readdir(join(output, "assets"))
            const script = assets.find((asset) => asset.endsWith(".js"))

            expect(script).toBeDefined()
            if (script === undefined) throw new Error("Expected a JavaScript build asset")

            await expect(access(join(output, "index.html"))).resolves.toBeUndefined()
            await expect(readFile(join(output, "assets", script), "utf8")).resolves.toContain("WebAnvil React SPA")
        }, 60_000)
    })
})
