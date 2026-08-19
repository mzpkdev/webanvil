import { execa } from "execa"
import { playwright } from "@vitest/browser-playwright"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import type { TestProjectInlineConfiguration } from "vitest/config"

import type { StorybookConfig } from "../config"
import { Toolchain } from "./toolchain"
import { useToolExecutable } from "./use-tool"

type StorybookAction = "build" | "dev"

type StorybookRunOptions = {
    configDir?: string
    host?: string
    outDir?: string
    port?: number
}

export const storybookOutputDir = (config: StorybookConfig = {}, options: StorybookRunOptions = {}): string =>
    options.outDir ?? config.outDir ?? "storybook-static"

const exitWithError = (action: StorybookAction, exitCode: number | undefined): never => {
    throw new Error(`storybook ${action} exited with code ${exitCode ?? "unknown"}`)
}

export const runStorybook = async (
    action: StorybookAction,
    config: StorybookConfig = {},
    options: StorybookRunOptions = {},
    toolchain = new Toolchain(process.cwd())
): Promise<void> => {
    const executable = await useToolExecutable("storybook", toolchain)
    const configDir = options.configDir ?? config.configDir
    const outDir = storybookOutputDir(config, options)
    const arguments_ = [
        action,
        ...(configDir === undefined ? [] : ["--config-dir", configDir]),
        ...(action === "dev" && options.host !== undefined ? ["--host", options.host] : []),
        ...(action === "dev" && options.port !== undefined ? ["--port", String(options.port)] : []),
        ...(action === "build" ? ["--output-dir", outDir] : [])
    ]
    const result = await execa(executable, arguments_, { reject: false, stdio: "inherit" })
    if (result.exitCode !== 0) exitWithError(action, result.exitCode)
}

export const createStorybookTestProject = async (
    config: StorybookConfig = {}
): Promise<TestProjectInlineConfiguration> => {
    const previousVitest = process.env.VITEST
    process.env.VITEST = "true"
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
