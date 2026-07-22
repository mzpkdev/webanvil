import { execute, terminal } from "cmdore"
import packageJson from "../package.json" with { type: "json" }

import { buildCommand, testCommand } from "./commands/index"

export const main = async (...varargs: string[]): Promise<number> =>
    execute([buildCommand, testCommand], {
        argv: varargs,
        metadata: {
            name: packageJson.name,
            version: packageJson.version
        },
        onError: "throw"
    })

main(...process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
        terminal.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
    })
