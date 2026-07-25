import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { readBuildInfo, writeBuildInfo } from "../src/core/build-info"
import { createNodeBuildPlan, runNodeBuild } from "../src/core/node-build"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-node-transaction-"))
    directories.push(directory)
    return directory
}

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("Node build transaction", () => {
    it("replaces a tracked declaration reported as a generated module source", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "index.ts"), "export const value = true\n")
        await writeFile(join(directory, "index.d.ts"), "stale declaration\n")
        await writeBuildInfo(["index.d.ts"], directory)
        process.chdir(directory)

        const plan = await createNodeBuildPlan("index.ts", ".", { declaration: false }, [])
        const declaration = join(directory, "index.d.ts")
        const rolldown = async () => ({
            close: async () => {},
            generate: async () => ({
                output: [
                    {
                        type: "chunk",
                        code: "export declare const value: boolean\n",
                        facadeModuleId: declaration,
                        fileName: "index.d.ts",
                        modules: { [declaration]: {} }
                    }
                ]
            })
        })

        await runNodeBuild(plan, rolldown as never)

        await expect(readFile(declaration, "utf8")).resolves.toBe("export declare const value: boolean\n")
        await expect(readBuildInfo(directory)).resolves.toEqual({ output: ["index.d.ts"] })
    })

    it("rejects an untracked authored declaration reported at the same output path", async () => {
        const directory = await createDirectory()
        await writeFile(join(directory, "index.ts"), "export const value = true\n")
        await writeFile(join(directory, "index.d.ts"), "export declare const authored: true\n")
        process.chdir(directory)

        const plan = await createNodeBuildPlan("index.ts", ".", { declaration: false }, [])
        const declaration = join(directory, "index.d.ts")
        const rolldown = async () => ({
            close: async () => {},
            generate: async () => ({
                output: [
                    {
                        type: "chunk",
                        code: "export declare const value: boolean\n",
                        facadeModuleId: declaration,
                        fileName: "index.d.ts",
                        modules: { [declaration]: {} }
                    }
                ]
            })
        })

        await expect(runNodeBuild(plan, rolldown as never)).rejects.toThrow(
            "Node generated output index.d.ts aliases authored source index.d.ts"
        )
        await expect(readFile(declaration, "utf8")).resolves.toBe("export declare const authored: true\n")
        await expect(readBuildInfo(directory)).resolves.toEqual({ output: [] })
    })

    it("restores previous output and build info after a mid-commit rename failure", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, "src"), { recursive: true })
        await mkdir(join(directory, "dist"), { recursive: true })
        await writeFile(join(directory, "src", "index.ts"), "export const value = true\n")
        await writeFile(join(directory, "dist", "one.js"), "previous one\n")
        await writeFile(join(directory, "dist", "two.js"), "previous two\n")
        await writeFile(join(directory, "dist", "authored.txt"), "keep authored\n")
        await writeBuildInfo(["dist/one.js", "dist/two.js"], directory)
        const previousBuildInfo = await readFile(join(directory, ".webanvil", "buildinfo.json"), "utf8")
        process.chdir(directory)

        const plan = await createNodeBuildPlan("src/index.ts", "dist", {}, [])
        const rolldown = async () => ({
            close: async () => {},
            generate: async () => ({
                output: [
                    { type: "asset", fileName: "one.js", source: "next one\n" },
                    { type: "asset", fileName: "two.js", source: "next two\n" }
                ]
            })
        })
        let installed = 0

        await expect(
            runNodeBuild(plan, rolldown as never, {
                rename: async (from, to) => {
                    if (String(from).includes(`${sep}next${sep}`) && ++installed === 2) {
                        throw Object.assign(new Error("forced mid-commit failure"), { code: "EIO" })
                    }
                    await rename(from, to)
                }
            })
        ).rejects.toThrow("forced mid-commit failure")

        await expect(readFile(join(directory, "dist", "one.js"), "utf8")).resolves.toBe("previous one\n")
        await expect(readFile(join(directory, "dist", "two.js"), "utf8")).resolves.toBe("previous two\n")
        await expect(readFile(join(directory, "dist", "authored.txt"), "utf8")).resolves.toBe("keep authored\n")
        await expect(readFile(join(directory, ".webanvil", "buildinfo.json"), "utf8")).resolves.toBe(previousBuildInfo)
        await expect(readBuildInfo(directory)).resolves.toEqual({ output: ["dist/one.js", "dist/two.js"] })
    })
})
