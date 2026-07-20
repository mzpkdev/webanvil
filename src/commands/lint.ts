import { defineCommand } from "cmdore"
import { loadVialConfig } from "../config"
import { config, fix } from "../options"
import { biomeConfig, detectConfig, runBiome } from "../tools"

export const lintCommand = defineCommand({
    name: "lint",
    description: "Flag lint and style issues across the codebase",
    examples: ["src --fix"],
    arguments: [{ name: "paths", description: "Files or directories to lint", variadic: true }],
    options: [fix, config],
    run: async ({ paths, fix, config }) => {
        const c = await loadVialConfig()
        await runBiome("lint", fix, paths, config ?? detectConfig("biome") ?? biomeConfig(c))
    }
})
