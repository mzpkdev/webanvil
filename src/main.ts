import { fileURLToPath } from "node:url"

import { execute } from "cmdore"
import { readPackageJSON } from "pkg-types"

import { buildCommand, devCommand, formatCommand, lintCommand, testCommand, typecheckCommand } from "./commands/index"
import { logger } from "./tools"

export const main = async (...varargs: string[]): Promise<number> => {
    const packageJson = await readPackageJSON(fileURLToPath(new URL("..", import.meta.url)))

    return execute([buildCommand, devCommand, formatCommand, lintCommand, testCommand, typecheckCommand], {
        argv: varargs,
        metadata: {
            name: packageJson.name ?? "webanvil",
            version: packageJson.version
        },
        onError: "throw"
    })
}

main(...process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
        logger.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
    })
