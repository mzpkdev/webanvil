import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { copyStaticFiles, planStaticCopies } from "../src/core/static-copy"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-static-copy-"))
    directories.push(directory)
    return directory
}

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("static copy", () => {
    it("rejects source and destination paths outside the project", async () => {
        const directory = await createDirectory()
        process.chdir(directory)

        await expect(planStaticCopies([{ from: "../assets/**", to: "assets" }], "dist")).rejects.toThrow("project root")
        await expect(planStaticCopies([{ from: "assets/**", to: "../outside" }], "dist")).rejects.toThrow(
            "project root"
        )
        await expect(planStaticCopies([{ from: "assets/**", to: "assets" }], "../dist")).rejects.toThrow(
            "within the project"
        )
    })

    it("rejects duplicate copied destinations", async () => {
        const directory = await createDirectory()
        await mkdir(join(directory, "assets"), { recursive: true })
        await writeFile(join(directory, "assets", "logo.txt"), "logo\n")
        process.chdir(directory)

        await expect(
            planStaticCopies(
                [
                    { from: "assets/logo.txt", to: "static" },
                    { from: "assets/logo.txt", to: "static" }
                ],
                "dist"
            )
        ).rejects.toThrow("Duplicate copy destination")
    })

    it("refuses to copy through a nested symbolic link", async () => {
        const directory = await createDirectory()
        const external = await createDirectory()
        await mkdir(join(directory, "assets"), { recursive: true })
        await mkdir(join(directory, "dist", "safe"), { recursive: true })
        await writeFile(join(directory, "assets", "logo.txt"), "logo\n")
        await symlink(external, join(directory, "dist", "safe", "link"))
        process.chdir(directory)

        const copies = await planStaticCopies([{ from: "assets/logo.txt", to: "safe/link" }], "dist")

        await expect(copyStaticFiles(copies, [])).rejects.toThrow("symbolic link")
        await expect(access(join(external, "logo.txt"))).rejects.toThrow()
    })
})
