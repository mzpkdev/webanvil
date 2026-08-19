import { defineCommand, defineOption } from "cmdore"

import { type UserConfig, loadConfig } from "../config"
import { useOptionalTool, useTool } from "../core/use-tool"
import { format } from "./format"
import { lint } from "./lint"
import { type TypecheckOptions, typecheck } from "./typecheck"

type CheckConfig = Pick<UserConfig, "format" | "lint">

const fix = defineOption({
    name: "fix",
    description: "Format files and apply safe lint fixes.",
    arity: 0
})

export const checkProject = async (
    fixFiles = false,
    config: CheckConfig = {},
    typecheckOptions?: TypecheckOptions
): Promise<void> => {
    await format([], !fixFiles, config.format)
    await lint([], fixFiles, config.lint)
    if (typecheckOptions === undefined) await typecheck([])
    else await typecheck([], typecheckOptions)
}

export default defineCommand({
    name: "check",
    description: "Check formatting, linting, and types, stopping at the first failure.",
    options: [fix],
    run: async ({ fix }) => {
        const [svelteCheck] = await Promise.all([useOptionalTool("svelte-check"), useTool("oxfmt"), useTool("oxlint")])
        if (svelteCheck === undefined) await useTool("typescript-native")
        const { config } = await loadConfig()
        await checkProject(fix, config, { svelteCheck })
    }
})
