import { existsSync, writeFileSync } from "node:fs"
import path from "node:path"
import { defineCommand, effect, terminal } from "cmdore"
import { BUILTIN, hasWebanvilConfig } from "../config"
import * as opt from "../options"
import { ownedTsconfigText } from "../tools"

/** Default scaffold: a JSON config whose `$schema` points at the schema shipped in the package, so
 *  editors give autocomplete and validation out of the box. */
const CONFIG_JSON = `{
    "$schema": "./node_modules/@crazy-pocs/webanvil/webanvil.schema.json"
}
`

/** `--ts` scaffold: a typed config. Autocomplete comes from the WebanvilConfig type, so there is no
 *  `$schema` line; the shipped schema still serves any hand-written webanvil.config.json. */
const CONFIG_TS = `import type { WebanvilConfig } from "@crazy-pocs/webanvil"

export default {} satisfies WebanvilConfig
`

const GITIGNORE = `node_modules/
dist/
.turbo/
coverage/
`

export const initCommand = defineCommand({
    name: "init",
    description: "Scaffold a starter webanvil.config, tsconfig, and .gitignore",
    examples: ["", "--ts", "--force"],
    options: [opt.ts, opt.force],
    run: async ({ ts, force }) => {
        const cwd = process.cwd()
        // Never clobber (matching tsconfig scaffolding); --force overrides. effect() gates the write
        // so --dry-run lists targets without touching the tree.
        const write = async (name: string, contents: string, exists: boolean): Promise<void> => {
            if (exists && !force) {
                terminal.log(`webanvil: skipped ${name} (already exists)`)
                return
            }
            terminal.log(`webanvil: writing ${name}`)
            await effect(() => writeFileSync(path.join(cwd, name), contents))
        }
        // A webanvil.config in any supported extension counts as present, so init never adds a second one.
        const [configFile, configBody] = ts ? ["webanvil.config.ts", CONFIG_TS] : ["webanvil.config.json", CONFIG_JSON]
        await write(configFile, configBody, hasWebanvilConfig(cwd))
        // The webanvil-owned (header) tsconfig, so `webanvil typecheck --check` passes with no drift.
        const tsconfigExists = existsSync(path.join(cwd, "tsconfig.json"))
        await write("tsconfig.json", ownedTsconfigText(BUILTIN.typecheck.compilerOptions), tsconfigExists)
        await write(".gitignore", GITIGNORE, existsSync(path.join(cwd, ".gitignore")))
    }
})
