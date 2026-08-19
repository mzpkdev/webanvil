import { access, readdir } from "node:fs/promises"
import { join, resolve } from "pathe"

export const hasFile = async (path: string): Promise<boolean> =>
    access(path)
        .then(() => true)
        .catch(() => false)

export const hasToolConfig = async (name: "vite" | "vitest", cwd = process.cwd()): Promise<boolean> => {
    const files: string[] = await readdir(cwd).catch(() => [])
    const extensions = ["js", "mjs", "cjs", "ts", "mts", "cts"]

    return extensions.some((extension) => files.includes(`${name}.config.${extension}`))
}

export const hasOxcConfig = (name: "oxfmt" | "oxlint", cwd = process.cwd()): Promise<boolean> =>
    hasFile(join(cwd, name === "oxfmt" ? ".oxfmtrc.json" : ".oxlintrc.json"))

export const hasStorybookConfig = async (configDir = ".storybook", cwd = process.cwd()): Promise<boolean> => {
    const files: string[] = await readdir(resolve(cwd, configDir)).catch(() => [])
    const extensions = ["js", "mjs", "cjs", "ts", "mts", "cts"]
    return extensions.some((extension) => files.includes(`main.${extension}`))
}
