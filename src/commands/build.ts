import { existsSync } from "node:fs"
import path from "node:path"
import { CmdoreError, defineCommand } from "cmdore"
import { loadWebanvilConfig, type Target, type WebanvilConfig } from "../config"
import { detectPlugins } from "../frameworks"
import * as opt from "../options"
import { detectConfig, run, targets, watchBuild, whenProvided, writeConfig, writeJsonConfig } from "../tools"

export const buildCommand = defineCommand({
    name: "build",
    description: "Compile a library entry, or build a web app when an index.html is present",
    examples: ["src/index.ts --outdir dist", "--app", "src/index.ts --watch"],
    arguments: [{ name: "entry", description: "Library entry point (omit for an app build)", required: false }],
    options: [opt.app, opt.outdir, opt.target, opt.minify, opt.sourcemap, opt.watch, opt.config],
    run: async ({ entry, app, outdir, target, minify, sourcemap, watch, config }) => {
        const overrides: WebanvilConfig = {
            target: whenProvided(opt.target, target as Target),
            build: {
                outDir: whenProvided(opt.outdir, outdir),
                minify: whenProvided(opt.minify, minify),
                sourcemap: whenProvided(opt.sourcemap, sourcemap)
            }
        }
        const c = await loadWebanvilConfig(overrides)

        // App when asked, or when there is an index.html and no explicit library entry. Otherwise
        // the entry-driven library build (unbuild).
        const isApp = app || (!entry && existsSync(path.resolve("index.html")))
        if (isApp) {
            const { imports, calls } = detectPlugins()
            const cfg =
                config ??
                detectConfig("vite") ??
                writeConfig(
                    "vite.config.mjs",
                    `${imports.join("\n")}
export default {
    root: ${JSON.stringify(path.resolve("."))},
    plugins: [${calls.join(", ")}],
    build: {
        outDir: ${JSON.stringify(path.resolve(c.build.outDir))},
        emptyOutDir: true,
        target: ${JSON.stringify(targets(c.target).viteTarget)},
        minify: ${Boolean(c.build.minify)},
        sourcemap: ${Boolean(c.build.sourcemap)}
    }
}
`
                )
            // Vite's app build has a native rollup watcher, so --watch maps straight through.
            await run("vite")(["build", "--config", cfg, ...(watch ? ["--watch"] : [])])
            return
        }

        if (!entry) {
            throw new CmdoreError("provide a library entry, or add an index.html for an app build", { exitCode: 1 })
        }
        const cfg =
            config ??
            detectConfig("unbuild") ??
            writeJsonConfig("build.config.mjs", {
                entries: [entry],
                outDir: c.build.outDir,
                declaration: c.build.declaration,
                clean: c.build.clean,
                sourcemap: c.build.sourcemap,
                rollup: { emitCJS: false, esbuild: { platform: targets(c.target).platform, minify: c.build.minify } }
            })
        const build = (): Promise<void> => run("unbuild")([".", "--config", cfg])
        if (watch) {
            await watchBuild(path.dirname(path.resolve(entry)), c.build.outDir, build)
        } else {
            await build()
        }
    }
})
