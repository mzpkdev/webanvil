import { execute } from "cmdore"
import { commands } from "./commands"
import { parseProvidedFlags, setPassthrough, setProvidedFlags } from "./tools"

export * from "./commands"
export type { ResolvedConfig, Target, VialConfig } from "./config"

export const metadata = {
    name: "vial",
    version: "0.0.0",
    description:
        "A unified CLI that brings Bun's all-in-one command surface to Node.js projects, powered by Vite, Vitest, unbuild, TypeScript, and Biome"
} as const

export function main(argv: string[] = process.argv.slice(2)): Promise<number> {
    // Everything after `--` is forwarded verbatim to the underlying tool; the rest
    // is parsed by cmdore as vial's own command, arguments, and options.
    const cut = argv.indexOf("--")
    const own = cut === -1 ? argv : argv.slice(0, cut)
    setPassthrough(cut === -1 ? [] : argv.slice(cut + 1))
    // Record which flags were explicitly typed so commands can layer them over vial.config.
    setProvidedFlags(parseProvidedFlags(own))
    return execute(commands, { metadata, argv: own })
}
