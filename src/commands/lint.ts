import { defineCommand } from "cmdore"

import { paths } from "../arguments"
import { type LintConfig, withConfig } from "../config"
import { fix } from "../options"
import { logger } from "../tools"
import { runTool } from "./tool"

export const lint = async (paths: string[], fix = false, config?: LintConfig): Promise<void> => {
    logger.start("Linting")
    await runTool("oxlint", [...(fix ? ["--fix"] : []), "--deny-warnings", ...paths], config)
    logger.success("Lint passed")
}

export default defineCommand({
    name: "lint",
    arguments: [paths],
    options: [fix],
    run: withConfig(
        (config) => config.lint,
        ({ paths, fix }, config) => lint(paths, fix, config)
    )
})
