import { execFile } from "node:child_process"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const npm = process.platform === "win32" ? "npm.cmd" : "npm"
const root = fileURLToPath(new URL("..", import.meta.url))

const runNpm = async (cwd: string, ...args: string[]): Promise<void> => {
    await execFileAsync(npm, args, { cwd })
}

export const examplePath = (name: string): string => join(root, "examples", name)

export const installExample = async (example: string): Promise<void> => {
    await runNpm(example, "ci")
}

export const testExample = async (example: string): Promise<void> => {
    await runNpm(example, "run", "test")
}

export const buildExample = async (example: string): Promise<string> => {
    const output = join(example, "dist")

    await rm(output, { force: true, recursive: true })
    await runNpm(example, "run", "build")
    return output
}
