import { defineCommand, defineOption } from "cmdore"

import { type UserConfig, loadConfig } from "../config"
import { useTool } from "../core/use-tool"
import { format } from "./format"
import { lint } from "./lint"
import { typecheck } from "./typecheck"

type CheckConfig = Pick<UserConfig, "format" | "lint">

const fix = defineOption({
    name: "fix",
    description: "Format files and apply safe lint fixes.",
    arity: 0
})

export const checkProject = async (fixFiles = false, config: CheckConfig = {}): Promise<void> => {
    await format([], !fixFiles, config.format)
    await lint([], fixFiles, config.lint)
    await typecheck([])
}

export default defineCommand({
    name: "check",
    description: "Check formatting, linting, and types, stopping at the first failure.",
    options: [fix],
    run: async ({ fix }) => {
        await Promise.all([useTool("oxfmt"), useTool("oxlint"), useTool("typescript-native")])
        const { config } = await loadConfig()
        await checkProject(fix, config)
    }
})
