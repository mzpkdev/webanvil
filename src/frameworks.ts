import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { terminal } from "cmdore"

/** A known UI framework, its Vite plugin package, and how the generated config imports and calls
 *  it. `named` is set when the plugin is a named (not default) export. */
type Framework = { dep: string; plugin: string; named?: string; call: string }

const FRAMEWORKS: readonly Framework[] = [
    { dep: "react", plugin: "@vitejs/plugin-react", call: "react()" },
    { dep: "vue", plugin: "@vitejs/plugin-vue", call: "vue()" },
    { dep: "solid-js", plugin: "vite-plugin-solid", call: "solid()" },
    { dep: "preact", plugin: "@preact/preset-vite", call: "preact()" },
    { dep: "svelte", plugin: "@sveltejs/vite-plugin-svelte", named: "svelte", call: "svelte()" }
]

/** Vite plugin wiring for the generated config: absolute-path imports and the plugin-call
 *  expressions to place in `plugins: [...]`. */
export type PluginWiring = { imports: string[]; calls: string[] }

const dependencyNames = (cwd: string): Set<string> => {
    const manifest = path.join(cwd, "package.json")
    if (!existsSync(manifest)) {
        return new Set()
    }
    const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
    }
    return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])
}

/** Detect the package's UI framework from its deps and resolve the matching Vite plugin from the
 *  consumer's own install, so the generated (temp-dir) config can import it by absolute path. A
 *  detected framework whose plugin is not installed warns and is skipped. */
export const detectPlugins = (cwd: string = process.cwd()): PluginWiring => {
    const deps = dependencyNames(cwd)
    const require = createRequire(path.join(cwd, "package.json"))
    const wiring: PluginWiring = { imports: [], calls: [] }
    for (const framework of FRAMEWORKS) {
        if (!deps.has(framework.dep)) {
            continue
        }
        let resolved: string
        try {
            resolved = require.resolve(framework.plugin)
        } catch {
            terminal.warn(`vial: ${framework.dep} detected but its Vite plugin "${framework.plugin}" is not installed`)
            continue
        }
        const binding = framework.named ?? framework.call.slice(0, framework.call.indexOf("("))
        const clause = framework.named ? `{ ${framework.named} }` : binding
        wiring.imports.push(`import ${clause} from ${JSON.stringify(resolved)}`)
        wiring.calls.push(framework.call)
    }
    return wiring
}
