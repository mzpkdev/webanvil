import { defineCommand } from "cmdore"
import { startVitest } from "vitest/node"

import { withConfig } from "../config"
import { logger } from "../tools"

export const test = async (): Promise<void> => {
    logger.start("Running tests")
    const vitest = await startVitest("test", [], { passWithNoTests: true, run: true })
    const failed =
        vitest.state.getFiles().some((file) => file.result?.state === "fail") ||
        vitest.state.getUnhandledErrors().length > 0

    await vitest.close()

    if (failed) throw new Error("Tests failed")

    logger.success("Tests passed")
}

export default defineCommand({
    name: "test",
    run: withConfig(() => test())
})
