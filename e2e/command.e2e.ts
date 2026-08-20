import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { defaultE2EConfig, e2e } from "../src/commands/e2e"
import { build } from "../src/commands/build"
import { startPreview } from "../src/commands/preview"
import { useToolExecutable } from "../src/core/use-tool"
import { execa } from "execa"

vi.mock("../src/commands/build", () => ({ build: vi.fn() }))
vi.mock("../src/commands/preview", () => ({ startPreview: vi.fn() }))
vi.mock("../src/core/use-tool", () => ({ useToolExecutable: vi.fn() }))
vi.mock("execa", () => ({ execa: vi.fn() }))

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-e2e-"))
    directories.push(directory)
    return directory
}

const preview = {
    close: vi.fn(async () => undefined),
    resolvedUrls: { local: ["http://127.0.0.1:4173/"] }
}

beforeEach(() => {
    vi.mocked(build).mockReset()
    vi.mocked(build).mockResolvedValue("dist")
    vi.mocked(startPreview).mockReset()
    vi.mocked(startPreview).mockResolvedValue(preview as never)
    vi.mocked(useToolExecutable).mockReset()
    vi.mocked(useToolExecutable).mockResolvedValue("/tools/playwright")
    vi.mocked(execa).mockReset()
    vi.mocked(execa).mockResolvedValue({} as never)
    preview.close.mockClear()
})

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("e2e", () => {
    it("defines a Chromium project for zero-config runs", () => {
        expect(defaultE2EConfig("/project/e2e", "http://127.0.0.1:4173/", "/temporary/results")).toMatchObject({
            projects: [{ name: "chromium", use: { browserName: "chromium" } }],
            use: { baseURL: "http://127.0.0.1:4173/" }
        })
    })

    it("builds, previews, and runs Playwright with generated defaults", async () => {
        const directory = await createDirectory()
        await writeFile(
            join(directory, "webanvil.config.ts"),
            'export default { build: { mode: "web", entry: "index.html", outDir: "dist" } }\n'
        )
        process.chdir(directory)

        await e2e([], { headed: true, project: "chromium" })

        expect(build).toHaveBeenCalledOnce()
        expect(startPreview).toHaveBeenCalledWith("dist", undefined, undefined, true, false, undefined)
        expect(execa).toHaveBeenCalledWith(
            "/tools/playwright",
            ["test", "--config", expect.any(String), "--pass-with-no-tests", "--headed", "--project", "chromium"],
            expect.objectContaining({ env: expect.objectContaining({ WEBANVIL_E2E_URL: "http://127.0.0.1:4173/" }) })
        )
        expect(preview.close).toHaveBeenCalledOnce()
    })

    it("defers to a native Playwright config without starting a second server", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "playwright.config.ts"), "export default {}\n")
        process.chdir(directory)

        await e2e(["login"], { debug: true, ui: true })

        expect(build).not.toHaveBeenCalled()
        expect(startPreview).not.toHaveBeenCalled()
        expect(execa).toHaveBeenCalledWith("/tools/playwright", ["test", "login", "--ui", "--debug"], expect.anything())
    })

    it("previews Vite's resolved output directory", async () => {
        const directory = await createDirectory()
        await writeFile(
            join(directory, "webanvil.config.ts"),
            'export default { build: { mode: "web", entry: "index.html", outDir: "dist" } }\n'
        )
        process.chdir(directory)
        vi.mocked(build).mockResolvedValue("native-dist")

        await e2e([])

        expect(startPreview).toHaveBeenCalledWith("native-dist", undefined, undefined, true, false, undefined)
    })

    it("closes the preview when generated configuration setup fails", async () => {
        const directory = await createDirectory()
        await writeFile(
            join(directory, "webanvil.config.ts"),
            'export default { build: { mode: "web", entry: "index.html", outDir: "dist" } }\n'
        )
        process.chdir(directory)
        const resolvedUrls = preview.resolvedUrls
        preview.resolvedUrls = {} as never

        await expect(e2e([])).rejects.toThrow("could not determine the preview URL")

        expect(preview.close).toHaveBeenCalledOnce()
        preview.resolvedUrls = resolvedUrls
    })

    it("requires a web build when no native Playwright config is present", async () => {
        const directory = await createDirectory()
        process.chdir(directory)

        await expect(e2e([])).rejects.toThrow('wa e2e requires build.mode: "web"')
    })
})
