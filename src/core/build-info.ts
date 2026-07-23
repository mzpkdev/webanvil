import { lstat, mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "pathe"

export type BuildInfo = { output: string[] }

const path = (cwd: string): string => resolve(cwd, ".webanvil", "buildinfo.json")

const relativeOutput = (file: string, cwd: string): string => {
    const output = relative(cwd, resolve(cwd, file))
    if (output === "" || output === ".." || output.startsWith("../") || isAbsolute(output)) {
        throw new Error(`Invalid build output: ${file}`)
    }
    return output
}

const assertSafeRemoval = async (file: string, cwd: string): Promise<void> => {
    const target = resolve(cwd, relativeOutput(file, cwd))
    let directory = dirname(target)

    while (directory !== resolve(cwd)) {
        try {
            if ((await lstat(directory)).isSymbolicLink()) {
                throw new Error(`Refusing to remove output through symbolic link: ${file}`)
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
        directory = dirname(directory)
    }
}

export const removeBuildOutputs = async (output: string[], cwd = process.cwd()): Promise<void> => {
    await Promise.all(
        output.map(async (file) => {
            await assertSafeRemoval(file, cwd)
            await rm(resolve(cwd, file), { force: true })
        })
    )
}

export const readBuildInfo = async (cwd = process.cwd()): Promise<BuildInfo> => {
    try {
        const value: unknown = JSON.parse(await readFile(path(cwd), "utf8"))
        if (
            typeof value !== "object" ||
            value === null ||
            !("output" in value) ||
            !Array.isArray(value.output) ||
            !value.output.every((file) => typeof file === "string")
        ) {
            throw new Error("Expected { output: string[] }")
        }
        return { output: value.output.map((file) => relativeOutput(file, cwd)) }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { output: [] }
        throw new Error(`Invalid .webanvil/buildinfo.json: ${error instanceof Error ? error.message : String(error)}`)
    }
}

export const writeBuildInfo = async (output: string[], cwd = process.cwd()): Promise<void> => {
    const file = path(cwd)
    const value: BuildInfo = {
        output: [...new Set(output.map((entry) => relativeOutput(entry, cwd)))].sort()
    }

    await mkdir(dirname(file), { recursive: true })
    await writeFile(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`)
    await rename(`${file}.tmp`, file)
}

export const removeOutputsIn = async (outDir: string, cwd = process.cwd()): Promise<BuildInfo> => {
    const info = await readBuildInfo(cwd)
    const directory = resolve(cwd, outDir)
    const output = info.output.filter((file) => {
        const target = resolve(cwd, file)
        return target !== directory && !relative(directory, target).startsWith("../")
    })

    await removeBuildOutputs(output, cwd)
    await Promise.all(
        [...new Set(output.map((file) => dirname(resolve(cwd, file))))].map(async (directory) => {
            while (directory !== resolve(cwd) && directory !== resolve(cwd, outDir)) {
                try {
                    await rmdir(directory)
                } catch (error) {
                    if (!["ENOENT", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error
                    break
                }
                directory = dirname(directory)
            }
        })
    )
    return { output: info.output.filter((file) => !output.includes(file)) }
}

export const clearBuildInfo = (cwd = process.cwd()): Promise<void> => writeBuildInfo([], cwd)
