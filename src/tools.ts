import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, watch as watchFs, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { CmdoreError, effect, terminal } from "cmdore"
import { hasVialConfig, type ResolvedConfig } from "./config"

const require = createRequire(import.meta.url)

/** A resolved tool invocation: which binary, which args, and a name for messages. */
export type Cmd = {
    readonly bin: string
    readonly args: readonly string[]
    readonly label: string
    readonly cwd?: string
}

/**
 * Absolute path to a dependency's CLI entry, resolved from vial's own install so
 * spawning works whether vial runs from source or as a published package, never
 * off the caller's PATH or nearest `node_modules/.bin`.
 */
export const binOf = (pkg: string): string => {
    let root: string
    try {
        // Fast path: works when the package's `exports` permits `./package.json`.
        root = path.dirname(require.resolve(`${pkg}/package.json`))
    } catch {
        // Fallback for packages that gate `./package.json` (e.g. unbuild under Node):
        // resolve the main entry, then walk up to the owning package root.
        let dir = path.dirname(require.resolve(pkg))
        for (;;) {
            const manifest = path.join(dir, "package.json")
            if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === pkg) {
                root = dir
                break
            }
            const parent = path.dirname(dir)
            if (parent === dir) {
                throw new Error(`cannot locate package "${pkg}"`)
            }
            dir = parent
        }
    }
    const { bin } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
    const entry = typeof bin === "string" ? bin : Object.values(bin)[0]
    if (typeof entry !== "string") {
        throw new Error(`package "${pkg}" declares no bin`)
    }
    return path.join(root, entry)
}

/** Pure: describe how to invoke a package's CLI with the given args. */
export const cmd =
    (pkg: string) =>
    (args: string[]): Cmd => ({ bin: binOf(pkg), args, label: pkg.replace(/^@[^/]+\//, "") })

/**
 * Effect: run a described command under vial's own runtime, streaming its output.
 * Throws a CmdoreError carrying the tool's exit code so `execute` propagates it,
 * and is a no-op under `--dry-run` (the spawn is wrapped in `effect`).
 */
const spawn = async ({ bin, args, label, cwd }: Cmd): Promise<void> => {
    terminal.verbose(`$ ${process.execPath} ${bin} ${args.join(" ")}`)
    await effect(() => {
        const result = spawnSync(process.execPath, [bin, ...args], { stdio: "inherit", cwd })
        if (result.error) {
            throw new CmdoreError(`could not run ${label}: ${result.error.message}`, { exitCode: 1 })
        }
        if (result.status !== 0) {
            throw new CmdoreError(`${label} exited with code ${result.status ?? 1}`, { exitCode: result.status ?? 1 })
        }
    })
}

/** Extra args (everything after `--`) forwarded verbatim to every spawned tool. */
let passthrough: readonly string[] = []

/** Set the passthrough args. Called once by main() after splitting argv on `--`. */
export const setPassthrough = (args: readonly string[]): void => {
    passthrough = args
}

/** Option tokens the user actually typed this run (names and aliases, dashes stripped). Lets a
 *  command tell an explicit flag from a cmdore default so unset flags never clobber vial.config. */
let provided: ReadonlySet<string> = new Set()

/** Pull the provided option tokens out of argv (the slice before `--`). */
export const parseProvidedFlags = (argv: readonly string[]): Set<string> =>
    new Set(
        argv
            .filter((token) => token.startsWith("-") && token !== "--")
            .map((token) => token.replace(/^-+/, "").split("=")[0])
            .filter((name): name is string => Boolean(name))
    )

/** Record which flags were explicitly typed. Called once by main(). */
export const setProvidedFlags = (flags: ReadonlySet<string>): void => {
    provided = flags
}

/** Whether the user explicitly passed this option (by name or alias) this run. */
export const wasProvided = (option: { name: string; alias?: string }): boolean =>
    provided.has(option.name) || (option.alias != null && provided.has(option.alias))

/** The option's value when explicitly passed this run, else undefined. defu and c12 ignore
 *  undefined, so an unset flag never clobbers vial.config. Used to build config overrides. */
export const whenProvided = <T>(option: { name: string; alias?: string }, value: T): T | undefined =>
    wasProvided(option) ? value : undefined

/** Run a described command as-is, with no passthrough. Used by `run`, which routes passthrough
 *  to the underlying script through turbo's own `--`. */
export const exec =
    (pkg: string) =>
    (args: string[]): Promise<void> =>
        spawn(cmd(pkg)(args))

/** Curried tool runner: `run("vite")(["build", …])`. Appends any passthrough args. */
export const run =
    (pkg: string) =>
    (args: string[]): Promise<void> =>
        exec(pkg)([...args, ...passthrough])

/** Re-invoke vial's own CLI in another package's directory, under vial's runtime, streaming
 *  output. Used by `run` to execute a vial command in workspace packages that declare no matching
 *  script. Respects --dry-run and verbose logging via `spawn`. */
export const execVialIn = (dir: string, args: string[]): Promise<void> =>
    spawn({ bin: binOf("@crazy-pocs/vial"), args, label: `vial ${args[0] ?? ""}`.trim(), cwd: dir })

/** The passthrough args (everything after `--`), for commands that route them explicitly. */
export const getPassthrough = (): readonly string[] => passthrough

/** Write config text into a throwaway dir and return the file path to point a tool at. */
export const writeConfig = (filename: string, contents: string): string => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "vial-")), filename)
    writeFileSync(file, contents)
    return file
}

/** Write a plain-object config as an ESM `export default` module. */
export const writeJsonConfig = (filename: string, config: object): string =>
    writeConfig(filename, `export default ${JSON.stringify(config, null, 4)}\n`)

const withExtensions = (base: string): string[] =>
    ["ts", "mts", "cts", "js", "mjs", "cjs"].map((ext) => `${base}.${ext}`)

/** Project config filenames vial looks for in the cwd, per tool. */
const CONFIG_NAMES: Record<string, string[]> = {
    vite: withExtensions("vite.config"),
    vitest: [...withExtensions("vitest.config"), ...withExtensions("vite.config")],
    unbuild: [...withExtensions("build.config"), "build.config.json"],
    tsc: ["tsconfig.json"],
    biome: ["biome.json", "biome.jsonc"]
}

/** First project config for a tool found in the cwd, or undefined. Sits between vial's
 *  generated default and an explicit --config: default < detected < --config. */
export const detectConfig = (tool: string): string | undefined => {
    for (const name of CONFIG_NAMES[tool] ?? []) {
        const candidate = path.resolve(name)
        if (existsSync(candidate)) {
            return candidate
        }
    }
    return undefined
}

/** tsconfig JSON text for the given compilerOptions. `base` prefixes the include/exclude globs
 *  so a throwaway config outside the project still resolves to it; empty for a file at the root. */
const tsconfigJson = (compilerOptions: Record<string, unknown>, base = ""): string =>
    JSON.stringify(
        {
            compilerOptions,
            include: [`${base}**/*.ts`, `${base}**/*.tsx`],
            exclude: [`${base}**/node_modules/**`, `${base}**/dist/**`]
        },
        null,
        4
    )

/** Throwaway tsconfig in a temp dir, its globs absolute so tsc type-checks the project from
 *  afar. Used non-interactively so the working tree is never touched. */
export const tempTsconfig = (compilerOptions: Record<string, unknown>): string =>
    writeConfig("tsconfig.json", tsconfigJson(compilerOptions, `${path.resolve(".")}/`))

/** Scaffold vial's default tsconfig.json under `cwd`, never clobbering an existing one. Used
 *  when there is no vial.config, so the file is the user's to own after the first write. */
export const scaffoldTsconfig = (compilerOptions: Record<string, unknown>, cwd: string = process.cwd()): Promise<string> => {
    const file = path.join(cwd, "tsconfig.json")
    return existsSync(file)
        ? Promise.resolve(file)
        : effect(() => {
              terminal.log(`vial: writing default tsconfig.json to ${file}`)
              writeFileSync(file, tsconfigJson(compilerOptions))
          }).then(() => file)
}

/** Header marking a root file as vial-owned when a vial.config drives it (tsconfig, turbo.json). */
const GENERATED_HEADER = "// Generated by vial from vial.config. Edit vial.config, not this file.\n"

/** The exact tsconfig.json text vial owns when a vial.config drives the project: header + options.
 *  Shared by `ownedTsconfig` (typecheck) and `vial init` so both write byte-identical files. */
export const ownedTsconfigText = (compilerOptions: Record<string, unknown>): string =>
    `${GENERATED_HEADER}${tsconfigJson(compilerOptions)}\n`

/** When a vial.config owns the root tsconfig: rewrite it from the merged compilerOptions, or under
 *  `check` verify it is in sync and fail otherwise. Writes only on drift, so repeated runs are
 *  quiet and leave git clean. Returns the tsconfig path either way. */
export const ownedTsconfig = async (
    compilerOptions: Record<string, unknown>,
    check: boolean,
    cwd: string = process.cwd()
): Promise<string> => {
    const file = path.join(cwd, "tsconfig.json")
    const expected = ownedTsconfigText(compilerOptions)
    if (existsSync(file) && readFileSync(file, "utf8") === expected) {
        return file
    }
    if (check) {
        throw new CmdoreError("tsconfig.json is out of sync with vial.config; run `vial typecheck` to regenerate it", {
            exitCode: 1
        })
    }
    terminal.log(`vial: writing tsconfig.json from vial.config to ${file}`)
    await effect(() => writeFileSync(file, expected))
    return file
}

/** turbo.json text for the given task pipeline (Turborepo reads this only from the repo root). */
const turboJson = (tasks: ResolvedConfig["tasks"]): string =>
    JSON.stringify({ $schema: "https://turborepo.dev/schema.json", tasks }, null, 4)

/** Ensure a root turbo.json for `turbo run`, which reads it only from the workspace root (no
 *  config-path flag exists). With a vial.config, vial owns it and regenerates from the merged
 *  tasks on drift; without one, it scaffolds a default once and never clobbers an existing file. */
export const resolveTurboConfig = async (tasks: ResolvedConfig["tasks"], cwd: string = process.cwd()): Promise<void> => {
    const file = path.join(cwd, "turbo.json")
    if (hasVialConfig(cwd)) {
        const expected = `${GENERATED_HEADER}${turboJson(tasks)}\n`
        if (existsSync(file) && readFileSync(file, "utf8") === expected) {
            return
        }
        terminal.log(`vial: writing turbo.json from vial.config to ${file}`)
        await effect(() => writeFileSync(file, expected))
        return
    }
    if (!existsSync(file)) {
        terminal.log(`vial: writing default turbo.json to ${file}`)
        await effect(() => writeFileSync(file, `${turboJson(tasks)}\n`))
    }
}

/** Fall back to the current directory when no paths are given. */
export const withPaths = (paths: string[]): string[] => (paths.length > 0 ? paths : ["."])

const PLATFORM: Record<string, string> = { browser: "browser", node: "node", bun: "neutral" }
const VITE_TARGET: Record<string, string> = { browser: "baseline-widely-available", node: "node18", bun: "esnext" }

/** Map vial's `--target` (browser|bun|node) onto each bundler's own target vocabulary. */
export const targets = (target: string): { platform: string; viteTarget: string } => ({
    platform: PLATFORM[target] ?? "browser",
    viteTarget: VITE_TARGET[target] ?? "baseline-widely-available"
})

/** Biome runs config-free, so vial generates a biome.json from the merged config and points
 *  `--config-path` at it, keeping output identical across repos regardless of local files. */
export const biomeConfig = (c: ResolvedConfig): string =>
    path.dirname(
        writeConfig(
            "biome.json",
            JSON.stringify(
                {
                    // Never lint or format generated output or caches; `includes` replaces biome's
                    // defaults, so node_modules is re-excluded explicitly alongside the build outDir.
                    files: {
                        includes: [
                            "**",
                            `!**/${c.build.outDir}/**`,
                            "!**/node_modules/**",
                            "!**/.turbo/**",
                            "!**/coverage/**"
                        ]
                    },
                    formatter: {
                        enabled: true,
                        indentStyle: c.format.indentStyle,
                        indentWidth: c.format.indentWidth,
                        lineWidth: c.format.lineWidth
                    },
                    linter: { enabled: true, rules: c.lint.rules === "recommended" ? { recommended: true } : c.lint.rules },
                    javascript: { formatter: { quoteStyle: c.format.quoteStyle, semicolons: c.format.semicolons } }
                },
                null,
                2
            )
        )
    )

const biome = run("@biomejs/biome")

/** Run a Biome subcommand over the given paths, applying fixes when asked, using the resolved
 *  config path (a --config, a detected biome.json, or vial's generated one). */
export const runBiome = (subcommand: string, apply: boolean, paths: string[], configPath: string): Promise<void> =>
    biome([subcommand, `--config-path=${configPath}`, ...(apply ? ["--write"] : []), ...withPaths(paths)])

/**
 * Rebuild on change: run `task` once, then re-run it (debounced) whenever a file under `watchRoot`
 * changes, ignoring the build's own `outDir` and dependency/VCS dirs so a build never retriggers
 * itself. Zero-dep and cross-platform: watches each directory with node:fs.watch (not the recursive
 * option, which Linux lacks), picking up new subdirectories as they appear. Blocks until interrupted;
 * build failures are logged, not fatal. A no-op under --dry-run (runs the gated build once, returns).
 */
export const watchBuild = async (watchRoot: string, outDir: string, task: () => Promise<void>): Promise<void> => {
    const runOnce = async (): Promise<void> => {
        try {
            await task()
        } catch (error) {
            terminal.error(error instanceof Error ? error.message : String(error))
        }
    }
    await runOnce()
    if (!effect.enabled) {
        return // --dry-run: the build is a no-op, so there is nothing to watch
    }

    const absOut = path.resolve(outDir)
    const skip = new Set(["node_modules", ".git", ".turbo"])
    const ignored = (dir: string): boolean =>
        dir === absOut || dir.startsWith(`${absOut}${path.sep}`) || dir.split(path.sep).some((segment) => skip.has(segment))

    let timer: ReturnType<typeof setTimeout> | undefined
    const trigger = (): void => {
        if (timer) {
            clearTimeout(timer)
        }
        timer = setTimeout(() => void runOnce(), 100)
    }

    const watched = new Set<string>()
    const scan = (start: string): void => {
        try {
            if (ignored(start) || !statSync(start).isDirectory()) {
                return
            }
            if (!watched.has(start)) {
                watched.add(start)
                watchFs(start, (_event, name) => {
                    trigger()
                    if (name) {
                        scan(path.join(start, name.toString())) // a new subdirectory joins the watch set
                    }
                })
            }
            for (const entry of readdirSync(start, { withFileTypes: true })) {
                if (entry.isDirectory()) {
                    scan(path.join(start, entry.name))
                }
            }
        } catch {
            // a removed or unreadable directory: skip it
        }
    }
    scan(path.resolve(watchRoot))
    terminal.log(`vial: watching for changes under ${watchRoot} (Ctrl-C to stop)`)
    return new Promise<void>(() => {}) // resolves never; the watcher runs until the process is interrupted
}
