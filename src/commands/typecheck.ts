import { defineCommand } from "cmdore"
import { getTsconfig } from "get-tsconfig"

import { paths } from "../arguments"
import { type ResolvedTool } from "../core/toolchain"
import { useOptionalTool } from "../core/use-tool"
import { runTool } from "../core/utils"
import { logger } from "../tools"

const typecheckArguments = async (paths: string[]): Promise<string[]> => {
    if (paths.length > 0) return ["--noEmit", "--ignoreConfig", ...paths]

    const config = getTsconfig(process.cwd(), { typescriptVersion: false })
    return config?.config.references?.length ? ["-b", "--noEmit"] : ["--noEmit"]
}

export type TypecheckOptions = {
    svelteCheck: ResolvedTool | undefined
}

export const typecheck = async (paths: string[], options?: TypecheckOptions): Promise<void> => {
    const svelteCheck =
        paths.length === 0
            ? options === undefined
                ? await useOptionalTool("svelte-check")
                : options.svelteCheck
            : undefined

    logger.start(svelteCheck === undefined ? "Type checking" : "Checking Svelte")
    await runTool(
        svelteCheck === undefined ? "tsgo" : "svelte-check",
        svelteCheck === undefined ? await typecheckArguments(paths) : []
    )
    logger.success("Type check passed")
}

export default defineCommand({
    name: "typecheck",
    arguments: [paths],
    run: ({ paths }) => typecheck(paths)
})
