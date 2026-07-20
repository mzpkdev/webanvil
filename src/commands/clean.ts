import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { defineCommand, effect, terminal } from "cmdore"
import { loadVialConfig } from "../config"
import * as opt from "../options"

const GLOB = /[*?[\]{}()!]/

/** The non-glob directory prefix of a turbo `outputs` pattern, e.g. "dist/**" -> "dist". Returns
 *  undefined for a negation, a variable, or a leading glob, none of which map to a safe exact path. */
const outputBase = (pattern: string): string | undefined => {
    if (pattern.startsWith("!") || pattern.includes("$")) {
        return undefined
    }
    const base: string[] = []
    for (const part of pattern.split("/")) {
        if (GLOB.test(part)) {
            break
        }
        base.push(part)
    }
    const joined = base.join("/")
    return joined === "" ? undefined : joined
}

export const cleanCommand = defineCommand({
    name: "clean",
    description: "Remove build artifacts and tool caches",
    examples: ["", "--deep", "--dry-run"],
    options: [opt.deep],
    run: async ({ deep }) => {
        const cwd = process.cwd()
        const c = await loadVialConfig()

        // Candidates (relative to cwd): the build outDir, every task's declared outputs (the same
        // globs turbo caches, so both read one declaration), and the tool caches. --deep adds
        // node_modules; its cache subdirs are removed either way.
        const candidates = [c.build.outDir]
        for (const task of Object.values(c.tasks)) {
            for (const glob of task.outputs ?? []) {
                const base = outputBase(glob)
                if (base) {
                    candidates.push(base)
                }
            }
        }
        candidates.push(".turbo", "coverage", "node_modules/.cache", "node_modules/.vite")
        if (deep) {
            candidates.push("node_modules")
        }

        // Never delete outside cwd, the sources, the manifest, or vial-owned config; node_modules is
        // protected unless --deep (the cache subdirs above stay fair game, being deeper paths).
        const protectedPaths = new Set(
            ["src", "package.json", "tsconfig.json", "turbo.json"].map((p) => path.join(cwd, p))
        )
        if (!deep) {
            protectedPaths.add(path.join(cwd, "node_modules"))
        }
        const isSafe = (abs: string): boolean =>
            abs.startsWith(`${cwd}${path.sep}`) &&
            !protectedPaths.has(abs) &&
            !path.basename(abs).startsWith("vial.config.")

        // Dedup by resolved path (outDir "dist" and output "dist/**" collapse to one), keep only safe,
        // existing targets.
        const targets = new Map<string, string>()
        for (const rel of candidates) {
            const abs = path.resolve(cwd, rel)
            if (isSafe(abs) && existsSync(abs) && !targets.has(abs)) {
                targets.set(abs, rel)
            }
        }

        if (targets.size === 0) {
            terminal.log("vial: nothing to clean")
            return
        }
        for (const [abs, rel] of targets) {
            terminal.log(`vial: ${effect.enabled ? "removing" : "would remove"} ${rel}`)
            await effect(() => rmSync(abs, { recursive: true, force: true }))
        }
    }
})
