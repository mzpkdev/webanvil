import { access, readdir } from "node:fs/promises"
import { join } from "node:path"

export const hasFile = async (path: string): Promise<boolean> =>
    access(path)
        .then(() => true)
        .catch(() => false)

export const hasToolConfig = async (name: "vite" | "vitest", cwd = process.cwd()): Promise<boolean> => {
    const prefix = `${name}.config.`
    const files = await readdir(cwd).catch(() => [])

    return files.some((file) => file === `${name}.config` || file.startsWith(prefix))
}

export const hasOxcConfig = (name: "oxfmt" | "oxlint", cwd = process.cwd()): Promise<boolean> =>
    hasFile(join(cwd, name === "oxfmt" ? ".oxfmtrc.json" : ".oxlintrc.json"))
