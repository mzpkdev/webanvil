import { defineCommand } from "cmdore"

import { paths } from "../arguments"
import { type FormatConfig, withConfig } from "../config"
import { check } from "../options"
import { logger } from "../tools"
import { runTool } from "./tool"

export const format = async (paths: string[], check = false, config?: FormatConfig): Promise<void> => {
    logger.start(check ? "Checking formatting" : "Formatting")
    await runTool("oxfmt", [...(check ? ["--check"] : []), ...paths], config)
    logger.success(check ? "Formatting passed" : "Formatted")
}

export default defineCommand({
    name: "format",
    arguments: [paths],
    options: [check],
    run: withConfig(
        (config) => config.format,
        ({ paths, check }, config) => format(paths, check, config)
    )
})
