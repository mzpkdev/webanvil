import path from "node:path"
import { defineCommand } from "cmdore"
import { loadVialConfig, type VialConfig } from "../config"
import * as opt from "../options"
import { detectConfig, run, whenProvided, writeJsonConfig } from "../tools"

export const devCommand = defineCommand({
    name: "dev",
    description: "Start a dev server with hot module reloading",
    examples: ["src --port 3000 --host 0.0.0.0"],
    arguments: [{ name: "root", description: "Project root to serve", defaultValue: () => "." }],
    options: [opt.port, opt.host, opt.config],
    run: async ({ root, port, host, config }) => {
        const overrides: VialConfig = {
            dev: { port: whenProvided(opt.port, Number(port)), host: whenProvided(opt.host, host) }
        }
        const c = await loadVialConfig(overrides)
        // Unlike `preview` (which serves a built `outDir`), the dev server serves source straight
        // from `root`, so the target dir maps to Vite's `root` with no outDir juggling.
        const cfg =
            config ??
            detectConfig("vite") ??
            writeJsonConfig("vite.config.mjs", {
                root: path.resolve(root),
                server: { port: c.dev.port, host: c.dev.host }
            })
        await run("vite")(["dev", "--config", cfg])
    }
})

/** `serve` is a Vite-flavored alias for `dev`. cmdore matches commands by name, so the alias is a
 *  second registration sharing dev's arguments, options, and run handler. */
export const serveCommand = defineCommand({ ...devCommand, name: "serve", description: "Alias for `dev`" })
