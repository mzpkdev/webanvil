import { defineCommand } from "cmdore"

import { filters } from "../arguments"
import { hasToolConfig } from "../config-files"
import { type TestConfig, withConfig } from "../config"
import { untilTerminated } from "../core/until-terminated"
import { useTool, useToolApi } from "../core/use-tool"
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
    waitForTermination: () => Promise<void> = untilTerminated
): Promise<void> => {
    if (options.uiPort !== undefined && options.ui !== true) throw new Error("--ui-port requires --ui")

    logger.start("Running tests")
    const hasVitestConfig = await hasToolConfig("vitest")
    const persistent = options.watch === true || options.ui === true
    const { startVitest } = await useToolApi<typeof import("vitest/node")>("vitest", "node")
    const nativeConfig = hasVitestConfig ? {} : config
    const nativeCoverage =
        typeof nativeConfig.coverage === "object" && nativeConfig.coverage !== null ? nativeConfig.coverage : {}
    const nativeApi = typeof nativeConfig.api === "object" && nativeConfig.api !== null ? nativeConfig.api : {}
    const vitest = await startVitest("test", filters, {
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
    })
    if (persistent) {
        try {
            await waitForTermination()
        } finally {
            await vitest.close()
        }
        return
    }
    const failed =
        vitest.state.getFiles().some((file) => file.result?.state === "fail") ||
        vitest.state.getUnhandledErrors().length > 0

    await vitest.close()

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
    ({ filters, environment, coverage, ui, "ui-port": uiPort, watch }, config, _resolvedConfig, explicitArguments) =>
        test(filters, config, {
            coverage,
            environment: explicitArguments.environment === undefined ? undefined : environment,
            ui,
            uiPort,
            watch
        })
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
