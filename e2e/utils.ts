import { execFile, spawn } from "node:child_process"
import { access, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const root = fileURLToPath(new URL("..", import.meta.url))

export type PackageManager = "npm" | "pnpm" | "bun"

export type CommandInvocation = {
    command: string
    args: string[]
}

export type CommandOutput = {
    stderr: string
    stdout: string
    output: string
}

type CommandFailure = Error & {
    stderr?: string
    stdout?: string
}

const requestedPackageManager = process.env.WEBANVIL_E2E_PACKAGE_MANAGER ?? "npm"
if (!["npm", "pnpm", "bun"].includes(requestedPackageManager)) {
    throw new Error(`WEBANVIL_E2E_PACKAGE_MANAGER must be npm, pnpm, or bun; received ${requestedPackageManager}`)
}
export const packageManager = requestedPackageManager as PackageManager

const commandName = (name: PackageManager): string => (process.platform === "win32" ? `${name}.cmd` : name)

const cacheDirectory = (name: PackageManager): string => join(tmpdir(), `webanvil-e2e-${name}-cache`)

const commandEnvironment = (
    environment: NodeJS.ProcessEnv = process.env,
    nodeEnvironment?: "development" | "production"
): NodeJS.ProcessEnv => {
    const { TEST: _vitestTestEnvironment, ...callerEnvironment } = environment
    if (callerEnvironment.NODE_ENV === "test") delete callerEnvironment.NODE_ENV
    return {
        ...callerEnvironment,
        ...(nodeEnvironment === undefined ? {} : { NODE_ENV: nodeEnvironment }),
        BUN_INSTALL_CACHE_DIR: cacheDirectory("bun"),
        npm_config_audit: "false",
        npm_config_cache: cacheDirectory("npm"),
        npm_config_fund: "false",
        npm_config_update_notifier: "false",
        PNPM_HOME: cacheDirectory("pnpm")
    }
}

export const packageManagerCommand = (
    name: PackageManager,
    operation: "install" | "webanvil",
    args: string[] = [],
    locked = false
): CommandInvocation => {
    if (operation === "webanvil") {
        if (name === "npm") return { command: commandName(name), args: ["exec", "--", "wa", ...args] }
        if (name === "pnpm") return { command: commandName(name), args: ["exec", "wa", ...args] }
        return { command: commandName(name), args: ["run", "--silent", "wa", ...args] }
    }

    if (name === "npm") {
        return {
            command: commandName(name),
            args: locked ? ["ci", "--ignore-scripts"] : ["install", "--ignore-scripts", "--no-package-lock"]
        }
    }
    if (name === "pnpm") {
        return {
            command: commandName(name),
            args: ["install", "--ignore-scripts", "--lockfile=false", "--store-dir", cacheDirectory(name)]
        }
    }
    return {
        command: commandName(name),
        args: ["install", "--ignore-scripts", "--no-save", "--cache-dir", cacheDirectory(name)]
    }
}

const run = async (
    invocation: CommandInvocation,
    cwd: string,
    nodeEnvironment?: "development" | "production"
): Promise<CommandOutput> => {
    try {
        const { stderr, stdout } = await execFileAsync(invocation.command, invocation.args, {
            cwd,
            encoding: "utf8",
            env: commandEnvironment(process.env, nodeEnvironment),
            maxBuffer: 10 * 1024 * 1024
        })
        return { stderr, stdout, output: `${stdout}\n${stderr}` }
    } catch (error) {
        const failure = error as CommandFailure
        failure.message = `${failure.message}\n${failure.stdout ?? ""}\n${failure.stderr ?? ""}`
        throw failure
    }
}

export async function npm(cwd: string, ...args: string[]): Promise<CommandOutput> {
    return run({ command: commandName(packageManager), args }, cwd)
}

export async function webanvil(cwd: string, ...args: string[]): Promise<CommandOutput> {
    return run(packageManagerCommand(packageManager, "webanvil", args), cwd)
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
    const invocation = packageManagerCommand(packageManager, "webanvil", [command, ...args])
    const child = spawn(invocation.command, invocation.args, {
        cwd: example,
        env: commandEnvironment(environment),
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

npm.install = async (cwd: string): Promise<CommandOutput> => {
    const locked =
        packageManager === "npm" &&
        (await access(join(cwd, "package-lock.json"))
            .then(() => true)
            .catch(() => false))
    return run(packageManagerCommand(packageManager, "install", [], locked), cwd, "development")
}

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
webanvil.e2e = (cwd: string, ...args: string[]) => webanvil(cwd, "e2e", ...args)
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
