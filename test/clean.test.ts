import { execFile } from "node:child_process"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { afterEach, describe, expect, it } from "vitest"

import { writeBuildInfo } from "../src/core/build-info"

const execFileAsync = promisify(execFile)
const binary = fileURLToPath(new URL("../bin/webanvil", import.meta.url))
const directories: string[] = []

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-clean-"))
    directories.push(directory)
    return directory
}

afterEach(async () =>
    Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
)

describe("clean", () => {
    it("removes recorded files across output directories", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, "src"), { recursive: true })
        await mkdir(join(directory, "dist"), { recursive: true })
        await writeFile(join(directory, "src", "index.js"), "generated\n")
        await writeFile(join(directory, "src", "keep.ts"), "export {}\n")
        await writeFile(join(directory, "dist", "index.js"), "generated\n")
        await writeBuildInfo(["src/index.js", "dist/index.js"], directory)

        await execFileAsync(binary, ["clean"], { cwd: directory })

        await expect(access(join(directory, "src", "index.js"))).rejects.toThrow()
        await expect(access(join(directory, "dist", "index.js"))).rejects.toThrow()
        await expect(readFile(join(directory, "src", "keep.ts"), "utf8")).resolves.toBe("export {}\n")
        await expect(readFile(join(directory, ".webanvil", "buildinfo.json"), "utf8")).resolves.toBe(
            '{\n  "output": []\n}\n'
        )
    })

    it("removes actual customized Node filenames and source maps", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, "src"), { recursive: true })
        await writeFile(join(directory, "src", "index.ts"), "export const value = true\n")
        await writeFile(
            join(directory, "webanvil.config.ts"),
            `export default {
                build: { bundle: true, formats: ["esm", "cjs"], sourcemap: true },
                rolldown: {
                    output: {
                        esm: { entryFileNames: "[name].mjs" },
                        cjs: { entryFileNames: "[name].js" }
                    }
                }
            }`
        )

        await execFileAsync(binary, ["build"], { cwd: directory })
        await expect(access(join(directory, "dist", "index.mjs"))).resolves.toBeUndefined()
        await expect(access(join(directory, "dist", "index.js.map"))).resolves.toBeUndefined()

        await execFileAsync(binary, ["clean"], { cwd: directory })

        await expect(access(join(directory, "dist", "index.mjs"))).rejects.toThrow()
        await expect(access(join(directory, "dist", "index.mjs.map"))).rejects.toThrow()
        await expect(access(join(directory, "dist", "index.js"))).rejects.toThrow()
        await expect(access(join(directory, "dist", "index.js.map"))).rejects.toThrow()
    })

    it("keeps authored sources after a rejected source-output alias", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, "src"), { recursive: true })
        await writeFile(join(directory, "src", "index.js"), "export const authored = true\n")

        await expect(
            execFileAsync(binary, ["build", "src/index.js", "--mode", "node", "--out-dir", "src"], {
                cwd: directory
            })
        ).rejects.toThrow("aliases authored source")

        await execFileAsync(binary, ["clean"], { cwd: directory })

        await expect(readFile(join(directory, "src", "index.js"), "utf8")).resolves.toBe(
            "export const authored = true\n"
        )
        await expect(readFile(join(directory, ".webanvil", "buildinfo.json"), "utf8")).resolves.toBe(
            '{\n  "output": []\n}\n'
        )
    })
})
