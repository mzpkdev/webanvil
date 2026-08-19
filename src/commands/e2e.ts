import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { defineCommand } from "cmdore"
import { execa } from "execa"

import { filters } from "../arguments"
import { hasToolConfig } from "../config-files"
import { loadConfig, resolveEffectiveBuildConfig } from "../config"
import { Toolchain } from "../core/toolchain"
import { useTool, useToolExecutable } from "../core/use-tool"
import { debug, headed, host, port, project, ui } from "../options"
import { logger } from "../tools"
import { build } from "./build"
import { startPreview } from "./preview"

type E2EOptions = {
    debug?: boolean
    headed?: boolean
    host?: string
    port?: number
    project?: string
    ui?: boolean
}

const localUrl = (server: Awaited<ReturnType<typeof startPreview>>): string => {
    const url = server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0]
    if (url === undefined) throw new Error("WebAnvil could not determine the preview URL for browser tests")
    return url
}

const argumentsFor = (filters: string[], options: E2EOptions, config?: string, passWithNoTests = false): string[] => [
    "test",
    ...(config === undefined ? [] : ["--config", config]),
    ...filters,
    ...(passWithNoTests ? ["--pass-with-no-tests"] : []),
    ...(options.ui ? ["--ui"] : []),
    ...(options.headed ? ["--headed"] : []),
    ...(options.debug ? ["--debug"] : []),
    ...(options.project === undefined ? [] : ["--project", options.project])
]

export const defaultE2EConfig = (testDir: string, baseURL: string, outputDir: string) => ({
    outputDir,
    projects: [{ name: "chromium", use: { browserName: "chromium" } }],
    testDir,
    use: { baseURL }
})

const defaultConfig = (testDir: string, baseURL: string, outputDir: string): string =>
    `${JSON.stringify(defaultE2EConfig(testDir, baseURL, outputDir), undefined, 4)}\n`

const runPlaywright = async (
    filters: string[],
    options: E2EOptions,
    config?: string,
    baseURL?: string,
    passWithNoTests = false
): Promise<void> => {
    const executable = await useToolExecutable("playwright")
    await execa(executable, argumentsFor(filters, options, config, passWithNoTests), {
        cwd: process.cwd(),
        env: {
            ...process.env,
            ...(baseURL === undefined ? {} : { WEBANVIL_E2E_URL: baseURL }),
            PLAYWRIGHT_TEST: "1"
        },
        stdio: "inherit"
    })
}

export const e2e = async (filters: string[], options: E2EOptions = {}): Promise<void> => {
    logger.start("Running end-to-end tests")

    if (await hasToolConfig("playwright")) {
        await runPlaywright(filters, options)
        logger.success("End-to-end tests passed")
        return
    }

    const { config } = await loadConfig()
    const effective = resolveEffectiveBuildConfig(config, {}, false)
    if (effective.mode !== "web") {
        throw new Error('wa e2e requires build.mode: "web" or a native playwright.config.* file')
    }

    const toolchain = new Toolchain(process.cwd())
    const output = await build(
        effective.mode,
        effective.entry!,
        effective.outDir!,
        effective,
        config.plugins ?? [],
        config.vite,
        config.rolldown,
        toolchain
    )

    const server = await startPreview(output, options.host, options.port, true, false, config.vite)
    const baseURL = localUrl(server)
    const directory = await mkdtemp(join(tmpdir(), "webanvil-playwright-"))
    const configPath = join(directory, "playwright.config.mjs")

    try {
        await writeFile(
            configPath,
            `export default ${defaultConfig(resolve(process.cwd(), "e2e"), baseURL, join(directory, "test-results"))}`
        )
        await runPlaywright(filters, options, configPath, baseURL, true)
    } finally {
        await Promise.all([server.close(), rm(directory, { force: true, recursive: true })])
    }

    logger.success("End-to-end tests passed")
}

export default defineCommand({
    name: "e2e",
    description: "Run end-to-end browser tests.",
    arguments: [filters],
    options: [host, port, ui, headed, debug, project],
    run: async ({ filters, host, port, ui, headed, debug, project }) => {
        const nativePlaywrightConfig = await hasToolConfig("playwright")
        await Promise.all([useTool("playwright"), ...(nativePlaywrightConfig ? [] : [useTool("vite")])])
        return e2e(filters, { debug, headed, host, port, project, ui })
    }
})
