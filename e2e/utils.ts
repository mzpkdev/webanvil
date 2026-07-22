import { type ChildProcess, execFile, spawn } from "node:child_process"
import { access, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const npm = process.platform === "win32" ? "npm.cmd" : "npm"
const root = fileURLToPath(new URL("..", import.meta.url))

const runNpm = async (cwd: string, ...args: string[]): Promise<void> => {
    await execFileAsync(npm, args, { cwd })
}

export type DevProcess = {
    child: ChildProcess
    output: () => string
}

export const examplePath = (name: string): string => join(root, "examples", name)

export const installExample = async (example: string): Promise<void> => {
    await runNpm(example, "ci")
}

export const testExample = async (example: string): Promise<void> => {
    await runNpm(example, "run", "test")
}

export const lintExample = async (example: string): Promise<void> => {
    await runNpm(example, "run", "lint")
}

export const checkExampleFormatting = async (example: string): Promise<void> => {
    await runNpm(example, "run", "format:check")
}

export const buildExample = async (example: string): Promise<string> => {
    const output = join(example, "dist")

    await rm(output, { force: true, recursive: true })
    await runNpm(example, "run", "build")
    return output
}

export const startExample = (example: string, ...args: string[]): DevProcess => {
    let output = ""
    const child = spawn(npm, ["run", "dev", "--", ...args], {
        cwd: example,
        stdio: ["ignore", "pipe", "pipe"]
    })
    const collect = (data: Buffer): void => {
        output += data.toString()
    }

    child.stdout?.on("data", collect)
    child.stderr?.on("data", collect)

    return { child, output: () => output }
}

const pause = async (milliseconds: number): Promise<void> => {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

export const waitFor = async (predicate: () => Promise<boolean>, message: string): Promise<void> => {
    const timeout = Date.now() + 10_000

    while (Date.now() < timeout) {
        try {
            if (await predicate()) return
        } catch {
            // The development server may not be listening yet.
        }
        await pause(100)
    }

    throw new Error(message)
}

export const waitForFile = async (path: string): Promise<void> => {
    await waitFor(
        async () =>
            access(path)
                .then(() => true)
                .catch(() => false),
        `Timed out waiting for ${path}`
    )
}

export const stopExample = async ({ child }: DevProcess): Promise<void> => {
    if (child.exitCode !== null) return

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            child.kill("SIGKILL")
            reject(new Error("Development process did not stop"))
        }, 10_000)

        child.once("error", (error) => {
            clearTimeout(timeout)
            reject(error)
        })
        child.once("exit", () => {
            clearTimeout(timeout)
            resolve()
        })
        child.kill("SIGTERM")
    })
}
