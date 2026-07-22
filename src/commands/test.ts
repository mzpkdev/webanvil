import { defineCommand } from "cmdore"
import { startVitest } from "vitest/node"

import { filters } from "../arguments"
import { withConfig } from "../config"
import { environment } from "../options"
import { logger } from "../tools"

export const test = async (filters: string[], environment: string, include?: string[]): Promise<void> => {
    logger.start("Running tests")
    const vitest = await startVitest("test", filters, {
        passWithNoTests: true,
        run: true,
        environment,
        ...(include === undefined ? {} : { include })
    })
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
    options: [environment],
    run: withConfig(
        (config) => config.test,
        ({ filters, environment }, config) => test(filters, environment, config.include)
    )
})
