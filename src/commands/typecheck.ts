import { defineCommand } from "cmdore"
import { getTsconfig } from "get-tsconfig"

import { paths } from "../arguments"
import { runTool } from "../core/utils"
import { logger } from "../tools"

const typecheckArguments = async (paths: string[]): Promise<string[]> => {
    if (paths.length > 0) return ["--noEmit", "--ignoreConfig", ...paths]

    const config = getTsconfig(process.cwd(), { typescriptVersion: false })
    return config?.config.references?.length ? ["-b", "--noEmit"] : ["--noEmit"]
}

export const typecheck = async (paths: string[]): Promise<void> => {
    logger.start("Type checking")
    await runTool("tsgo", await typecheckArguments(paths))
    logger.success("Type check passed")
}

export default defineCommand({
    name: "typecheck",
    arguments: [paths],
    run: ({ paths }) => typecheck(paths)
})
