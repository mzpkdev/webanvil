import { access, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { beforeAll, describe as context, describe, expect, it } from "vitest"

import { availablePort, project, npm, waitFor, webanvil } from "./utils"

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

        it("collects coverage with wa", async () => {
            const coverage = join(example, "coverage")

            try {
                await webanvil.test(example, "--coverage")
                await expect(access(join(coverage, "coverage-final.json"))).resolves.toBeUndefined()
            } finally {
                await rm(coverage, { force: true, recursive: true })
            }
        }, 60_000)

        it("watches and reruns tests with wa", async () => {
            const file = join(example, "test", "todo-app.test.ts")
            const original = await readFile(file, "utf8")
            const watcher = webanvil.testWatch(example)

            try {
                await waitFor(
                    async () => /Test Files|PASS/.test(watcher.output()),
                    `Vitest did not run in watch mode:\n${watcher.output()}`
                )
                const initialOutput = watcher.output()
                await writeFile(file, `${original}\n`)
                await waitFor(
                    async () => watcher.output().length > initialOutput.length,
                    `Vitest did not rerun after a test change:\n${watcher.output()}`
                )
            } finally {
                await writeFile(file, original)
                await watcher.stop()
            }
        }, 60_000)

        it("starts the Vitest UI with wa", async () => {
            const config = join(example, "vitest.config.ts")
            const port = await availablePort()
            await writeFile(
                config,
                `export default { test: { api: { port: ${port} }, environment: "jsdom", include: ["test/**/*.test.ts"] } }`
            )
            const ui = webanvil.testUi(example)

            try {
                await waitFor(
                    async () => (await fetch(`http://127.0.0.1:${port}/__vitest__/`)).ok,
                    `Vitest UI did not start:\n${ui.output()}`
                )
            } finally {
                await ui.stop()
                await rm(config, { force: true })
            }
        }, 60_000)

        it("builds an HTML entry with wa", async () => {
            const output = await webanvil.build(example)

            await expect(access(join(output, "index.html"))).resolves.toBeUndefined()
            await expect(readdir(join(output, "assets"))).resolves.toContainEqual(expect.stringMatching(/\.js$/))
        }, 60_000)

        it("starts a Vite development server with wa", async () => {
            const port = await availablePort()
            const dev = webanvil.dev(example, "--host", "127.0.0.1", "--port", String(port))

            try {
                await waitFor(
                    async () => (await fetch(`http://127.0.0.1:${port}`)).ok,
                    `Vite server did not start:\n${dev.output()}`
                )
            } finally {
                await dev.stop()
            }
        }, 60_000)

        it("serves the production build with wa preview", async () => {
            await webanvil.build(example)
            const port = await availablePort()
            const server = webanvil.preview(example, "--host", "127.0.0.1", "--port", String(port))

            try {
                await waitFor(async () => {
                    const response = await fetch(`http://127.0.0.1:${port}`)
                    return response.ok && (await response.text()).includes("/assets/")
                }, `Vite preview did not start:\n${server.output()}`)
            } finally {
                await server.stop()
            }
        }, 60_000)
    })
})
