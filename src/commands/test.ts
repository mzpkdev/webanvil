import { defineCommand } from "cmdore"
import { startVitest } from "vitest/node"

import { filters } from "../arguments"
import { hasToolConfig } from "../config-files"
import { withConfig } from "../config"
import { coverage, environment, ui, watch } from "../options"
import { logger } from "../tools"

const untilTerminated = (): Promise<void> =>
    new Promise((resolve) => {
        const terminate = (): void => {
            process.off("SIGINT", terminate)
            process.off("SIGTERM", terminate)
            resolve()
        }

        process.once("SIGINT", terminate)
        process.once("SIGTERM", terminate)
    })

export const test = async (
    filters: string[],
    environment: string,
    include?: string[],
    options: { coverage?: boolean; ui?: boolean; watch?: boolean } = {},
    waitForTermination: () => Promise<void> = untilTerminated
): Promise<void> => {
    logger.start("Running tests")
    const hasVitestConfig = await hasToolConfig("vitest")
    const persistent = options.watch === true || options.ui === true
    const vitest = await startVitest("test", filters, {
        passWithNoTests: true,
        run: !persistent,
        watch: persistent,
        ...(options.coverage ? { coverage: { enabled: true, provider: "v8" } } : {}),
        ...(options.ui ? { ui: true } : {}),
        ...(hasVitestConfig ? {} : { environment, ...(include === undefined ? {} : { include }) })
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

export default defineCommand({
    name: "test",
    arguments: [filters],
    options: [environment, watch, coverage, ui],
    run: withConfig(
        (config) => config.test,
        ({ filters, environment, coverage, ui, watch }, config) =>
            test(filters, environment, config.include, { coverage, ui, watch })
    )
})
