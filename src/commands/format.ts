import { defineCommand } from "cmdore"

import { paths } from "../arguments"
import { type FormatConfig, withConfig } from "../config"
import { useTool } from "../core/use-tool"
import { runTool } from "../core/utils"
import { check } from "../options"
import { logger } from "../tools"

export const format = async (paths: string[], check = false, config?: FormatConfig): Promise<void> => {
    logger.start(check ? "Checking formatting" : "Formatting")
    await runTool("oxfmt", [...(check ? ["--check"] : []), ...paths], config)
    logger.success(check ? "Formatting passed" : "Formatted")
}

const runFormat = withConfig<FormatConfig, { check?: boolean; paths: string[] }, void>(
    (config) => config.format,
    ({ paths, check }, config) => format(paths, check, config)
)

export default defineCommand({
    name: "format",
    arguments: [paths],
    options: [check],
    run: async (arguments_) => {
        await useTool("oxfmt")
        return runFormat(arguments_)
    }
})
