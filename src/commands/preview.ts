import path from "node:path"
import { defineCommand } from "cmdore"
import { loadWebanvilConfig, type WebanvilConfig } from "../config"
import * as opt from "../options"
import { detectConfig, run, whenProvided, writeJsonConfig } from "../tools"

export const previewCommand = defineCommand({
    name: "preview",
    description: "Locally preview a production build over HTTP",
    examples: ["dist --port 8080"],
    arguments: [{ name: "dir", description: "Directory of built files to preview", defaultValue: () => "." }],
    options: [opt.port, opt.host, opt.config],
    run: async ({ dir, port, host, config }) => {
        const overrides: WebanvilConfig = {
            preview: { port: whenProvided(opt.port, Number(port)), host: whenProvided(opt.host, host) }
        }
        const c = await loadWebanvilConfig(overrides)
        // Vite's preview server statically serves `outDir` resolved from `root`. Rooting at the
        // parent and pointing `outDir` at the target dir's name serves it verbatim, and avoids
        // Vite's warning about outDir being root or a parent of it.
        const abs = path.resolve(dir)
        const cfg =
            config ??
            detectConfig("vite") ??
            writeJsonConfig("vite.config.mjs", {
                root: path.dirname(abs),
                build: { outDir: path.basename(abs) },
                preview: { port: c.preview.port, host: c.preview.host }
            })
        await run("vite")(["preview", "--config", cfg])
    }
})
