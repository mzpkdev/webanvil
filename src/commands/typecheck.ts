import { defineCommand } from "cmdore"
import { hasWebanvilConfig, loadWebanvilConfig } from "../config"
import { check, config, noScaffold, watch } from "../options"
import { detectConfig, ownedTsconfig, run, scaffoldTsconfig, tempTsconfig } from "../tools"

export const typecheckCommand = defineCommand({
    name: "typecheck",
    description: "Type-check the project without emitting output",
    examples: ["--watch"],
    options: [watch, config, noScaffold, check],
    run: async ({ watch, config, "no-scaffold": skipScaffold, check }) => {
        const { typecheck } = await loadWebanvilConfig()
        const options = typecheck.compilerOptions
        // tsconfig must be a real on-disk file: editors, esbuild, and type-aware tooling discover
        // it by walking up from source. When a webanvil.config drives the project, webanvil owns and
        // regenerates the root tsconfig from the merged options (or verifies it under --check).
        // Otherwise use --config or a detected tsconfig, else scaffold one interactively (a temp
        // throwaway in CI or under --no-scaffold) so the working tree stays clean.
        const cfg =
            config ??
            (hasWebanvilConfig()
                ? await ownedTsconfig(options, check)
                : (detectConfig("tsc") ??
                  (process.stdout.isTTY && !skipScaffold ? await scaffoldTsconfig(options) : tempTsconfig(options))))
        const args = ["--project", cfg]
        if (watch) args.push("--watch")
        await run("typescript-native")(args)
    }
})
