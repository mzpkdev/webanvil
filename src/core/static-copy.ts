import { copyFile, lstat, mkdir, realpath } from "node:fs/promises"

import { dirname, isAbsolute, relative, resolve } from "pathe"
import { glob } from "tinyglobby"

import type { CopyMapping } from "../config"

type CopyFile = { from: string; to: string }

const isInside = (directory: string, target: string): boolean => {
    const path = relative(directory, target)
    return path === "" || (path !== ".." && !path.startsWith("../") && !isAbsolute(path))
}

const staticBase = (pattern: string): string => {
    const parts = pattern.replaceAll("\\", "/").split("/")
    const index = parts.findIndex((part) => /[*?[\]{}()!]/.test(part))
    return index === -1 ? dirname(pattern) : parts.slice(0, index).join("/") || "."
}

const assertRelative = (path: string, label: string): void => {
    if (path.length === 0 || isAbsolute(path) || !isInside(process.cwd(), resolve(process.cwd(), path))) {
        throw new Error(`${label} must be relative to the project root: ${path}`)
    }
}

const assertNoSymlink = async (path: string, directory: string): Promise<void> => {
    const target = dirname(path)
    if (!isInside(directory, target)) throw new Error(`Copy destination is outside the build output directory: ${path}`)

    let current = directory
    for (const segment of relative(directory, target).split("/").filter(Boolean)) {
        current = resolve(current, segment)
        try {
            if ((await lstat(current)).isSymbolicLink()) {
                throw new Error(`Refusing to copy through symbolic link: ${path}`)
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
    }
}

const assertSourceInsideProject = async (file: string, cwd: string): Promise<void> => {
    if (!isInside(await realpath(cwd), await realpath(file))) {
        throw new Error(`Copy source is outside the project root: ${file}`)
    }
}

export const planStaticCopies = async (mappings: CopyMapping[] | undefined, outDir: string): Promise<CopyFile[]> => {
    if (mappings == null || mappings.length === 0) return []

    const cwd = process.cwd()
    const output = resolve(cwd, outDir)
    if (!isInside(cwd, output)) throw new Error(`Build output directory must be within the project root: ${outDir}`)
    await assertNoSymlink(resolve(output, ".webanvil-static-copy"), cwd)

    const copies = await Promise.all(
        mappings.map(async ({ from, to }) => {
            assertRelative(from, "Copy source")
            assertRelative(to, "Copy destination")
            const base = resolve(cwd, staticBase(from))
            if (!isInside(cwd, base)) throw new Error(`Copy source is outside the project root: ${from}`)
            const files = await glob(from, { cwd, dot: true, onlyFiles: true })

            return Promise.all(
                files.map(async (file) => {
                    const source = resolve(cwd, file)
                    await assertSourceInsideProject(source, cwd)
                    const destination = resolve(output, to, relative(base, source))
                    if (!isInside(output, destination) || !isInside(cwd, destination)) {
                        throw new Error(`Copy destination is outside the build output directory: ${to}`)
                    }
                    return { from: source, to: destination }
                })
            )
        })
    )
    const files = copies.flat()
    const destinations = new Set<string>()
    for (const file of files) {
        if (destinations.has(file.to)) throw new Error(`Duplicate copy destination: ${relative(output, file.to)}`)
        destinations.add(file.to)
    }
    return files
}

export const copyStaticFiles = async (copies: CopyFile[], generated: string[]): Promise<string[]> => {
    if (copies.length === 0) return []

    await assertStaticCopyDestinationsAvailable(copies, generated)

    const cwd = process.cwd()
    for (const { from, to } of copies) {
        await assertNoSymlink(to, cwd)
        await mkdir(dirname(to), { recursive: true })
        await copyFile(from, to)
    }
    return copies.map(({ to }) => to)
}

export const assertStaticCopyDestinationsAvailable = async (
    copies: CopyFile[],
    generated: string[] = [],
    checkExisting = true
): Promise<void> => {
    const generatedPaths = new Set(generated.map((file) => resolve(process.cwd(), file)))
    for (const { to } of copies) {
        if (generatedPaths.has(to)) throw new Error(`Copy destination collides with generated output: ${to}`)
        if (!checkExisting) continue
        try {
            await lstat(to)
            throw new Error(`Copy destination already exists: ${to}`)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
    }
}
