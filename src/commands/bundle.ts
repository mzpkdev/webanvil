import path from "node:path"
import { defineCommand } from "cmdore"
import { loadVialConfig, type Target, type VialConfig } from "../config"
import * as opt from "../options"
import { detectConfig, run, targets, whenProvided, writeConfig } from "../tools"

export const bundleCommand = defineCommand({
    name: "bundle",
    description: "Bundle an entry point into a single file",
    examples: ["src/index.ts --outfile dist/vial.js --minify", "src/index.ts --outfile dist/vial.js --watch"],
    arguments: [{ name: "entry", description: "Entry point to bundle", required: true }],
    options: [opt.outfile, opt.target, opt.minify, opt.sourcemap, opt.watch, opt.config],
    run: async ({ entry, outfile, target, minify, sourcemap, watch, config }) => {
        const overrides: VialConfig = {
            target: whenProvided(opt.target, target as Target),
            bundle: { minify: whenProvided(opt.minify, minify), sourcemap: whenProvided(opt.sourcemap, sourcemap) }
        }
        const c = await loadVialConfig(overrides)
        // Written as raw source (not writeJsonConfig) because Vite's lib config needs a
        // live `fileName` function and a resolved entry path.
        const cfg =
            config ??
            detectConfig("vite") ??
            writeConfig(
                "vite.config.mjs",
                `import path from "node:path"
export default {
    build: {
        lib: { entry: path.resolve(${JSON.stringify(entry)}), formats: ["es"], fileName: () => ${JSON.stringify(path.basename(outfile))} },
        outDir: ${JSON.stringify(path.dirname(outfile) || ".")},
        emptyOutDir: false,
        minify: ${Boolean(c.bundle.minify)},
        sourcemap: ${Boolean(c.bundle.sourcemap)},
        target: ${JSON.stringify(targets(c.target).viteTarget)}
    }
}
`
            )
        // Vite's build has a native rollup watcher, so `--watch` maps straight through.
        const args = ["build", "--config", cfg]
        if (watch) {
            args.push("--watch")
        }
        await run("vite")(args)
    }
})
