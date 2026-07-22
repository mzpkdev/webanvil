import { defineCommand } from "cmdore"

import { paths } from "../arguments"
import { runTool } from "../core/utils"
import { logger } from "../tools"

export const typecheck = async (paths: string[]): Promise<void> => {
    logger.start("Type checking")
    await runTool("tsgo", ["--noEmit", ...(paths.length === 0 ? [] : ["--ignoreConfig"]), ...paths])
    logger.success("Type check passed")
}

export default defineCommand({
    name: "typecheck",
    arguments: [paths],
    run: ({ paths }) => typecheck(paths)
})
