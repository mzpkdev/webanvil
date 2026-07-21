import { defineCommand } from "cmdore"
import { loadWebanvilConfig, type WebanvilConfig } from "../config"
import * as opt from "../options"
import { detectConfig, run, whenProvided, writeJsonConfig } from "../tools"

export const testCommand = defineCommand({
    name: "test",
    description: "Run the project's test suite",
    examples: ["greeter --coverage"],
    arguments: [{ name: "patterns", description: "Test names or paths to run", variadic: true }],
    options: [opt.watch, opt.coverage, opt.config],
    run: async ({ patterns, watch, coverage, config }) => {
        const overrides: WebanvilConfig = { test: { coverage: whenProvided(opt.coverage, coverage) } }
        const c = await loadWebanvilConfig(overrides)
        const cfg =
            config ??
            detectConfig("vitest") ??
            writeJsonConfig("vitest.config.mjs", {
                test: {
                    globals: c.test.globals,
                    environment: c.test.environment,
                    watch: Boolean(watch),
                    coverage: { enabled: c.test.coverage },
                    // A package with no tests is not a failure; `webanvil run <task>` runs `webanvil test` in
                    // every scriptless workspace package, and empty ones must not fail the whole run.
                    passWithNoTests: true
                }
            })
        const args = ["--config", cfg]
        if (patterns.length > 0) args.push(...patterns)
        await run("vitest")(args)
    }
})
