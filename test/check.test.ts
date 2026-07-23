import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { checkProject } from "../src/commands/check"
import { format } from "../src/commands/format"
import { lint } from "../src/commands/lint"
import { typecheck } from "../src/commands/typecheck"

const execFileAsync = promisify(execFile)
const binary = fileURLToPath(new URL("../bin/webanvil", import.meta.url))
const directories: string[] = []

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-check-"))
    directories.push(directory)
    return directory
}

vi.mock("../src/commands/format", () => ({ format: vi.fn() }))
vi.mock("../src/commands/lint", () => ({ lint: vi.fn() }))
vi.mock("../src/commands/typecheck", () => ({ typecheck: vi.fn() }))

const formatMock = vi.mocked(format)
const lintMock = vi.mocked(lint)
const typecheckMock = vi.mocked(typecheck)

beforeEach(() => {
    vi.clearAllMocks()
})

afterEach(async () =>
    Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
)

describe("checkProject", () => {
    it("checks formatting, linting, and types in order without writing", async () => {
        const order: string[] = []
        const config = { format: {}, lint: {} }
        formatMock.mockImplementationOnce(async () => {
            order.push("format")
        })
        lintMock.mockImplementationOnce(async () => {
            order.push("lint")
        })
        typecheckMock.mockImplementationOnce(async () => {
            order.push("typecheck")
        })

        await expect(checkProject(false, config)).resolves.toBeUndefined()

        expect(order).toEqual(["format", "lint", "typecheck"])
        expect(formatMock).toHaveBeenCalledWith([], true, config.format)
        expect(lintMock).toHaveBeenCalledWith([], false, config.lint)
        expect(typecheckMock).toHaveBeenCalledWith([])
    })

    it("formats files and applies safe lint fixes with --fix", async () => {
        const config = { format: {}, lint: {} }

        await expect(checkProject(true, config)).resolves.toBeUndefined()

        expect(formatMock).toHaveBeenCalledWith([], false, config.format)
        expect(lintMock).toHaveBeenCalledWith([], true, config.lint)
        expect(typecheckMock).toHaveBeenCalledWith([])
    })

    it("stops when formatting fails", async () => {
        formatMock.mockRejectedValueOnce(new Error("Formatting failed"))

        await expect(checkProject()).rejects.toThrow("Formatting failed")

        expect(lintMock).not.toHaveBeenCalled()
        expect(typecheckMock).not.toHaveBeenCalled()
    })

    it("stops when linting fails", async () => {
        lintMock.mockRejectedValueOnce(new Error("Linting failed"))

        await expect(checkProject()).rejects.toThrow("Linting failed")

        expect(formatMock).toHaveBeenCalledOnce()
        expect(typecheckMock).not.toHaveBeenCalled()
    })
})

describe("check command", () => {
    it("registers accurate command and fix-option help", async () => {
        const [{ stdout: rootHelp }, { stdout: checkHelp }, { stdout: lintHelp }] = await Promise.all([
            execFileAsync(binary, ["--help"]),
            execFileAsync(binary, ["check", "--help"]),
            execFileAsync(binary, ["lint", "--help"])
        ])

        expect(rootHelp).toContain("check")
        expect(rootHelp).toContain("Check formatting, linting, and types, stopping at the first failure.")
        expect(checkHelp).toContain("webanvil check")
        expect(checkHelp).toContain("Check formatting, linting, and types, stopping at the first failure.")
        expect(checkHelp).toContain("Format files and apply safe lint fixes.")
        expect(lintHelp).toContain("Apply safe lint fixes.")
        expect(lintHelp).not.toContain("Format files and apply safe lint fixes.")
    })

    it("is read-only by default, fixes files, loads config, and then passes without --fix", async () => {
        const directory = await createDirectory()
        const sourcePath = join(directory, "src", "index.ts")
        const configPath = join(directory, "webanvil.config.mjs")
        const tsconfigPath = join(directory, "tsconfig.json")
        const source = "const _pattern=/\\a/\ndebugger"
        const config = 'export default {format:{semi:false},lint:{rules:{"no-debugger":"off"}}}\n'
        const tsconfig = '{ "compilerOptions": { "strict": true }, "include": ["src/**/*.ts"] }\n'
        await mkdir(join(directory, "src"))
        await writeFile(sourcePath, source)
        await writeFile(configPath, config)
        await writeFile(tsconfigPath, tsconfig)

        await expect(execFileAsync(binary, ["check"], { cwd: directory })).rejects.toMatchObject({ code: 1 })
        await expect(readFile(sourcePath, "utf8")).resolves.toBe(source)
        await expect(readFile(configPath, "utf8")).resolves.toBe(config)
        await expect(readFile(tsconfigPath, "utf8")).resolves.toBe(tsconfig)

        await expect(execFileAsync(binary, ["check", "--fix"], { cwd: directory })).resolves.toBeDefined()
        await expect(readFile(sourcePath, "utf8")).resolves.toBe("const _pattern = /a/\ndebugger\n")
        await expect(execFileAsync(binary, ["check"], { cwd: directory })).resolves.toBeDefined()
    })
})
