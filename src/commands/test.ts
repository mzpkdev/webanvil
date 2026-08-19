import { defineCommand } from "cmdore"

import { filters } from "../arguments"
import { hasStorybookConfig, hasToolConfig } from "../config-files"
import { type StorybookConfig, type TestConfig, withConfig } from "../config"
import { createStorybookTestProject } from "../core/storybook"
import { untilTerminated } from "../core/until-terminated"
import { useTool } from "../core/use-tool"
import { coverage, environment, ui, uiPort, watch } from "../options"
import { logger } from "../tools"

export const test = async (
    filters: string[],
    config: TestConfig = {},
    options: {
        coverage?: boolean
        environment?: TestConfig["environment"]
        ui?: boolean
        uiPort?: number
        watch?: boolean
    } = {},
    waitForTermination: () => Promise<void> = untilTerminated,
    storybook: StorybookConfig = {}
): Promise<void> => {
    if (options.uiPort !== undefined && options.ui !== true) throw new Error("--ui-port requires --ui")

    logger.start("Running tests")
    const hasVitestConfig = await hasToolConfig("vitest")
    const persistent = options.watch === true || options.ui === true
    const vitestTool = await useTool("vitest")
    const { startVitest } = await vitestTool.import<typeof import("vitest/node")>("node")
    const nativeConfig = hasVitestConfig ? {} : config
    const nativeCoverage =
        typeof nativeConfig.coverage === "object" && nativeConfig.coverage !== null ? nativeConfig.coverage : {}
    const nativeApi = typeof nativeConfig.api === "object" && nativeConfig.api !== null ? nativeConfig.api : {}
    const storybookProject =
        storybook.test === false || !(await hasStorybookConfig(storybook.configDir))
            ? undefined
            : await createStorybookTestProject(storybook, vitestTool.version)
    const vitestOptions: NonNullable<Parameters<typeof startVitest>[2]> = {
        ...nativeConfig,
        passWithNoTests: true,
        run: !persistent,
        watch: persistent,
        ...(options.environment === undefined ? {} : { environment: options.environment }),
        ...(options.coverage ? { coverage: { ...nativeCoverage, enabled: true, provider: "v8" } } : {}),
        ...(options.ui ? { ui: true } : {}),
        ...(options.uiPort === undefined
            ? {}
            : { api: { ...nativeApi, host: "127.0.0.1", port: options.uiPort, strictPort: true } })
    }
    const vitests =
        hasVitestConfig && storybookProject !== undefined
            ? [
                  await startVitest("test", filters, vitestOptions),
                  await startVitest("test", filters, {
                      ...vitestOptions,
                      ...(options.ui ? { api: false, ui: false } : {}),
                      projects: [storybookProject]
                  })
              ]
            : [
                  await startVitest("test", filters, {
                      ...vitestOptions,
                      ...(storybookProject === undefined
                          ? {}
                          : { projects: [...(nativeConfig.projects ?? []), storybookProject] })
                  })
              ]
    if (persistent) {
        try {
            await waitForTermination()
        } finally {
            await Promise.all(vitests.map((vitest) => vitest.close()))
        }
        return
    }
    const failed = vitests.some(
        (vitest) =>
            vitest.state.getFiles().some((file) => file.result?.state === "fail") ||
            vitest.state.getUnhandledErrors().length > 0
    )

    await Promise.all(vitests.map((vitest) => vitest.close()))

    if (failed) throw new Error("Tests failed")

    logger.success("Tests passed")
}

const runTest = withConfig<
    TestConfig,
    {
        coverage?: boolean
        environment?: string
        filters: string[]
        ui?: boolean
        "ui-port"?: number
        watch?: boolean
    },
    void
>(
    (config) => config.test,
    ({ filters, environment, coverage, ui, "ui-port": uiPort, watch }, config, resolvedConfig, explicitArguments) =>
        test(
            filters,
            config,
            {
                coverage,
                environment: explicitArguments.environment === undefined ? undefined : environment,
                ui,
                uiPort,
                watch
            },
            untilTerminated,
            resolvedConfig.storybook
        )
)

export default defineCommand({
    name: "test",
    arguments: [filters],
    options: [environment, watch, coverage, ui, uiPort],
    run: async (arguments_) => {
        await useTool("vitest")
        return runTest(arguments_)
    }
})
