import { execFile, spawn } from "node:child_process"
import { access, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"
const wa = process.platform === "win32" ? "wa.cmd" : "wa"
const root = fileURLToPath(new URL("..", import.meta.url))

export async function npm(cwd: string, ...args: string[]): Promise<void> {
    await execFileAsync(npmCommand, args, { cwd })
}

export async function webanvil(cwd: string, ...args: string[]): Promise<void> {
    await execFileAsync(join(cwd, "node_modules", ".bin", wa), args, { cwd })
}

type DevServer = {
    output: () => string
    stop: () => Promise<void>
}

export const project = (name: string): string => join(root, "examples", name)

export const availablePort = async (): Promise<number> =>
    new Promise((resolve, reject) => {
        const server = createServer()
        server.once("error", reject)
        server.listen(0, "127.0.0.1", () => {
            const address = server.address()
            if (address === null || typeof address === "string") {
                server.close(() => reject(new Error("Could not reserve a local port")))
                return
            }
            server.close((error) => (error === undefined ? resolve(address.port) : reject(error)))
        })
    })

const startWebAnvil = (
    example: string,
    command: string,
    args: string[],
    environment: NodeJS.ProcessEnv = process.env
): DevServer => {
    let output = ""
    const child = spawn(join(example, "node_modules", ".bin", wa), [command, ...args], {
        cwd: example,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"]
    })
    const collect = (data: Buffer): void => {
        output += data.toString()
    }

    child.stdout?.on("data", collect)
    child.stderr?.on("data", collect)

    return {
        output: () => output,
        stop: async (): Promise<void> => {
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
    }
}

npm.install = (cwd: string) => npm(cwd, "ci")

webanvil.build = async (cwd: string, outDir = "dist", ...args: string[]): Promise<string> => {
    const output = join(cwd, outDir)

    await rm(output, { force: true, recursive: true })
    await webanvil(cwd, "build", ...args)
    return output
}
webanvil.clean = (cwd: string) => webanvil(cwd, "clean")
webanvil.format = (cwd: string) => webanvil(cwd, "format", "--check")
webanvil.lint = (cwd: string) => webanvil(cwd, "lint")
webanvil.test = (cwd: string, ...args: string[]) => webanvil(cwd, "test", ...args)
webanvil.testUi = (cwd: string, ...args: string[]) => startWebAnvil(cwd, "test", ["--ui", ...args])
webanvil.testWatch = (cwd: string, ...args: string[]) => startWebAnvil(cwd, "test", ["--watch", ...args])
webanvil.typecheck = (cwd: string) => webanvil(cwd, "typecheck")
webanvil.preview = (cwd: string, ...args: string[]) =>
    startWebAnvil(cwd, "preview", args, { ...process.env, BROWSER: "none" })
webanvil.dev = (cwd: string, ...args: string[]) => startWebAnvil(cwd, "dev", args)

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
