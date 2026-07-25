import { defineCommand } from "cmdore"

import { paths } from "../arguments"
import { type LintConfig, withConfig } from "../config"
import { useTool } from "../core/use-tool"
import { runTool } from "../core/utils"
import { fix } from "../options"
import { logger } from "../tools"

export const lint = async (paths: string[], fix = false, config?: LintConfig): Promise<void> => {
    logger.start("Linting")
    await runTool("oxlint", [...(fix ? ["--fix"] : []), "--deny-warnings", ...paths], config)
    logger.success("Lint passed")
}

const runLint = withConfig<LintConfig, { fix?: boolean; paths: string[] }, void>(
    (config) => config.lint,
    ({ paths, fix }, config) => lint(paths, fix, config)
)

export default defineCommand({
    name: "lint",
    arguments: [paths],
    options: [fix],
    run: async (arguments_) => {
        await useTool("oxlint")
        return runLint(arguments_)
    }
})
