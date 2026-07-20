import { defineCommand } from "cmdore"
import { loadVialConfig } from "../config"
import { check, config } from "../options"
import { biomeConfig, detectConfig, runBiome } from "../tools"

export const formatCommand = defineCommand({
    name: "format",
    description: "Format code and prose to a consistent style",
    examples: ["src --check"],
    arguments: [{ name: "paths", description: "Files or directories to format", variadic: true }],
    options: [check, config],
    run: async ({ paths, check, config }) => {
        const c = await loadVialConfig()
        // Default rewrites files; `--check` reports drift and exits non-zero instead.
        await runBiome("format", !check, paths, config ?? detectConfig("biome") ?? biomeConfig(c))
    }
})
