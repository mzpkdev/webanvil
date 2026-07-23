import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { readBuildInfo, removeOutputsIn, writeBuildInfo } from "../src/core/build-info"

const directories: string[] = []

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-build-info-"))
    directories.push(directory)
    return directory
}

afterEach(async () =>
    Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
)

describe("build info", () => {
    it("returns empty output when no build info exists", async () => {
        await expect(readBuildInfo(await createDirectory())).resolves.toEqual({ output: [] })
    })

    it("rejects output paths outside the project", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, ".webanvil"))
        await writeFile(join(directory, ".webanvil", "buildinfo.json"), '{"output":["../outside.js"]}')

        await expect(readBuildInfo(directory)).rejects.toThrow("Invalid .webanvil/buildinfo.json")
    })

    it("removes only outputs within a target directory", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, "dist", "utils"), { recursive: true })
        await writeFile(join(directory, "dist", "utils", "helpers.js"), "generated\n")
        await writeBuildInfo(["dist/utils/helpers.js", "other/index.js"], directory)

        await expect(removeOutputsIn("dist", directory)).resolves.toEqual({
            output: ["other/index.js"]
        })
        await expect(readFile(join(directory, "dist", "utils", "helpers.js"))).rejects.toThrow()
        await expect(readFile(join(directory, "dist", "utils"))).rejects.toThrow()
    })

    it("refuses to remove an output through a symbolic link", async () => {
        const directory = await createDirectory()
        const external = await createDirectory()
        await writeFile(join(external, "important.txt"), "keep\n")
        await symlink(external, join(directory, "dist"))
        await writeBuildInfo(["dist/important.txt"], directory)

        await expect(removeOutputsIn("dist", directory)).rejects.toThrow("symbolic link")
        await expect(readFile(join(external, "important.txt"), "utf8")).resolves.toBe("keep\n")
    })

    it("refuses to remove an output through a nested symbolic link", async () => {
        const directory = await createDirectory()
        const external = await createDirectory()
        await mkdir(join(directory, "dist", "safe"), { recursive: true })
        await writeFile(join(external, "important.txt"), "keep\n")
        await symlink(external, join(directory, "dist", "safe", "link"))
        await writeBuildInfo(["dist/safe/link/important.txt"], directory)

        await expect(removeOutputsIn("dist", directory)).rejects.toThrow("symbolic link")
        await expect(readFile(join(external, "important.txt"), "utf8")).resolves.toBe("keep\n")
    })
})
