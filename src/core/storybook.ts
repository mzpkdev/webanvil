import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "pathe"
import { fileURLToPath } from "node:url"

import { execa } from "execa"
import type { TestProjectInlineConfiguration } from "vitest/config"

import type { StorybookConfig } from "../config"
import { Toolchain } from "./toolchain"
import { useToolExecutable } from "./use-tool"

type StorybookAction = "build" | "dev"
const storybookVitestVersion = "4.1.11"

type StorybookRunOptions = {
    configDir?: string
    host?: string
    outDir?: string
    port?: number
}

export type PreparedStorybookConfig = {
    config: StorybookConfig
    cleanup: () => Promise<void>
}

export type StorybookProcess = {
    completed: Promise<void>
    stop: () => void
}

const relativeModule = (from: string, to: string): string => {
    const path = relative(from, to).replaceAll("\\", "/")
    return path.startsWith(".") ? path : `./${path}`
}

const storybookMain = async (configDirectory: string): Promise<string> => {
    const files = await readdir(configDirectory).catch((): string[] => [])
    const extensions = ["js", "mjs", "cjs", "ts", "mts", "cts"]
    const file = extensions.map((extension) => `main.${extension}`).find((name) => files.includes(name))
    if (file === undefined) throw new Error(`Could not find a Storybook main configuration in ${configDirectory}`)
    return resolve(configDirectory, file)
}

const frameworkDirectory = (framework: NonNullable<StorybookConfig["framework"]>): string =>
    fileURLToPath(new URL(`../storybook/${framework}/`, import.meta.url))

export const prepareStorybookConfig = async (
    config: StorybookConfig = {}
): Promise<PreparedStorybookConfig | undefined> => {
    if (config.framework === undefined) return undefined

    const sourceDirectory = resolve(process.cwd(), config.configDir ?? ".storybook")
    const main = await storybookMain(sourceDirectory)
    const directory = await mkdtemp(resolve(dirname(sourceDirectory), ".webanvil-storybook-"))
    try {
        for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
            if (resolve(sourceDirectory, entry.name) === main) continue
            await symlink(
                resolve(sourceDirectory, entry.name),
                resolve(directory, entry.name),
                entry.isDirectory() ? "junction" : "file"
            )
        }
        await mkdir(directory, { recursive: true })
        await writeFile(
            resolve(directory, "main.ts"),
            `import config from ${JSON.stringify(relativeModule(directory, main))}\n\nexport default { ...config, framework: ${JSON.stringify(frameworkDirectory(config.framework))} }\n`
        )
        return {
            config: { ...config, configDir: directory },
            cleanup: () => rm(directory, { force: true, recursive: true })
        }
    } catch (error) {
        await rm(directory, { force: true, recursive: true })
        throw error
    }
}

export const storybookOutputDir = (config: StorybookConfig = {}, options: StorybookRunOptions = {}): string =>
    options.outDir ?? config.outDir ?? "storybook-static"

const exitWithError = (action: StorybookAction, exitCode: number | undefined): never => {
    throw new Error(`storybook ${action} exited with code ${exitCode ?? "unknown"}`)
}

export const startStorybook = async (
    action: StorybookAction,
    config: StorybookConfig = {},
    options: StorybookRunOptions = {},
    toolchain = new Toolchain(process.cwd())
): Promise<StorybookProcess> => {
    const executable = await useToolExecutable("storybook", toolchain)
    const prepared = await prepareStorybookConfig({ ...config, configDir: options.configDir ?? config.configDir })
    const effective = prepared?.config ?? config
    const configDir = effective.configDir
    const outDir = storybookOutputDir(effective, options)
    const arguments_ = [
        action,
        ...(configDir === undefined ? [] : ["--config-dir", configDir]),
        ...(action === "dev" && options.host !== undefined ? ["--host", options.host] : []),
        ...(action === "dev" && options.port !== undefined ? ["--port", String(options.port)] : []),
        ...(action === "build" ? ["--output-dir", outDir] : [])
    ]
    const child = execa(executable, arguments_, { reject: false, stdio: "inherit" })
    return {
        completed: child
            .then(
                (result) => {
                    if (result.exitCode !== 0) exitWithError(action, result.exitCode)
                },
                (error) => {
                    throw error
                }
            )
            .finally(() => prepared?.cleanup()),
        stop: () => child.kill("SIGTERM")
    }
}

export const runStorybook = async (
    action: StorybookAction,
    config: StorybookConfig = {},
    options: StorybookRunOptions = {},
    toolchain = new Toolchain(process.cwd())
): Promise<void> => (await startStorybook(action, config, options, toolchain)).completed

export const createStorybookTestProject = async (
    config: StorybookConfig = {},
    vitestVersion = storybookVitestVersion
): Promise<TestProjectInlineConfiguration> => {
    if (vitestVersion !== storybookVitestVersion) {
        throw new Error(
            `Storybook tests require Vitest ${storybookVitestVersion}; Webanvil bundles @vitest/browser-playwright ${storybookVitestVersion}`
        )
    }
    const previousVitest = process.env.VITEST
    process.env.VITEST = "true"
    const [{ playwright }, { storybookTest }] = await Promise.all([
        import("@vitest/browser-playwright"),
        import("@storybook/addon-vitest/vitest-plugin")
    ])
    let plugins: Awaited<ReturnType<typeof storybookTest>>
    try {
        plugins = await storybookTest({ configDir: config.configDir })
    } finally {
        if (previousVitest === undefined) delete process.env.VITEST
        else process.env.VITEST = previousVitest
    }

    return {
        extends: true,
        plugins,
        test: {
            name: "storybook",
            browser: {
                enabled: true,
                headless: true,
                provider: playwright(),
                instances: [{ browser: "chromium" }]
            }
        }
    }
}
