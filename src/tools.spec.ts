import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { CmdoreError, effect } from "cmdore"
import { BUILTIN } from "./config"
import {
    binOf,
    biomeConfig,
    cmd,
    detectConfig,
    ownedTsconfig,
    parseProvidedFlags,
    resolveTurboConfig,
    run,
    runBiome,
    scaffoldTsconfig,
    setPassthrough,
    setProvidedFlags,
    targets,
    tempTsconfig,
    whenProvided,
    withPaths,
    writeConfig,
    writeJsonConfig
} from "./tools"

/** vial's default compilerOptions, reused as fixture input for the tsconfig writers. */
const OPTS = BUILTIN.typecheck.compilerOptions

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }))

const spawn = vi.mocked(spawnSync)
const spawnResult = (value: object) => value as unknown as ReturnType<typeof spawnSync>
const argvOf = (call: number): string[] => (spawn.mock.calls[call] as unknown as [string, string[]])[1]

describe("tools", () => {
    context("binOf", () => {
        it.each([
            ["vite", "vite.js"],
            ["vitest", "vitest.mjs"],
            ["unbuild", "cli.mjs"],
            ["@biomejs/biome", "biome"]
        ])("resolves %s to an existing absolute bin", (pkg, suffix) => {
            const bin = binOf(pkg)
            expect(path.isAbsolute(bin)).toBe(true)
            expect(existsSync(bin)).toBe(true)
            expect(bin.endsWith(suffix)).toBe(true)
        })

        it("throws when the package cannot be resolved", () => {
            expect(() => binOf("definitely-not-a-real-package-xyz")).toThrow()
        })
    })

    context("cmd", () => {
        it("builds a Cmd with the resolved bin, args, and a scope-stripped label", () => {
            const built = cmd("vite")(["build", "--x"])
            expect(built.bin.endsWith("vite.js")).toBe(true)
            expect(built.args).toEqual(["build", "--x"])
            expect(built.label).toBe("vite")
        })

        it("strips the npm scope from the label", () => {
            expect(cmd("@biomejs/biome")([]).label).toBe("biome")
        })
    })

    context("writeConfig", () => {
        it("writes contents to a fresh temp file under the system temp dir", () => {
            const file = writeConfig("vite.config.mjs", "export default {}\n")
            expect(path.isAbsolute(file)).toBe(true)
            expect(file.startsWith(tmpdir())).toBe(true)
            expect(path.basename(file)).toBe("vite.config.mjs")
            expect(readFileSync(file, "utf8")).toBe("export default {}\n")
        })

        it("isolates each call in its own directory", () => {
            const a = writeConfig("config.mjs", "a")
            const b = writeConfig("config.mjs", "b")
            expect(path.dirname(a)).not.toBe(path.dirname(b))
            expect(readFileSync(a, "utf8")).toBe("a")
            expect(readFileSync(b, "utf8")).toBe("b")
        })
    })

    context("writeJsonConfig", () => {
        it("serializes a plain object as an ESM default export", () => {
            const body = readFileSync(writeJsonConfig("vitest.config.mjs", { test: { globals: true } }), "utf8")
            expect(body.startsWith("export default {")).toBe(true)
            expect(body).toContain('"globals": true')
            expect(body.endsWith("\n")).toBe(true)
        })
    })

    context("tempTsconfig", () => {
        it("writes a throwaway tsconfig with absolute globs under the temp dir", () => {
            const file = tempTsconfig(OPTS)
            expect(file.startsWith(tmpdir())).toBe(true)
            const cfg = JSON.parse(readFileSync(file, "utf8"))
            expect(cfg.compilerOptions.noEmit).toBe(true)
            expect(cfg.compilerOptions.strict).toBe(true)
            expect(cfg.include.every((glob: string) => path.isAbsolute(glob))).toBe(true)
        })
    })

    context("scaffoldTsconfig", () => {
        it("writes vial's default tsconfig into the given dir with root-relative globs", async () => {
            const dir = mkdtempSync(path.join(tmpdir(), "vial-scaffold-"))
            const file = await scaffoldTsconfig(OPTS, dir)
            expect(file).toBe(path.join(dir, "tsconfig.json"))
            const cfg = JSON.parse(readFileSync(file, "utf8"))
            expect(cfg.compilerOptions.strict).toBe(true)
            expect(cfg.include).toEqual(["**/*.ts", "**/*.tsx"])
        })

        it("returns an existing tsconfig untouched instead of clobbering it", async () => {
            const dir = mkdtempSync(path.join(tmpdir(), "vial-scaffold-"))
            const file = path.join(dir, "tsconfig.json")
            writeFileSync(file, '{"marker":true}')
            expect(await scaffoldTsconfig(OPTS, dir)).toBe(file)
            expect(JSON.parse(readFileSync(file, "utf8")).marker).toBe(true)
        })

        it("writes nothing under --dry-run but still returns the path", async () => {
            const dir = mkdtempSync(path.join(tmpdir(), "vial-scaffold-"))
            effect.enabled = false
            try {
                const file = await scaffoldTsconfig(OPTS, dir)
                expect(file).toBe(path.join(dir, "tsconfig.json"))
                expect(existsSync(file)).toBe(false)
            } finally {
                effect.enabled = true
            }
        })
    })

    context("ownedTsconfig", () => {
        it("writes a headered, flat tsconfig from the merged options", async () => {
            const dir = mkdtempSync(path.join(tmpdir(), "vial-owned-"))
            const file = await ownedTsconfig(OPTS, false, dir)
            expect(file).toBe(path.join(dir, "tsconfig.json"))
            const text = readFileSync(file, "utf8")
            expect(text.startsWith("// Generated by vial")).toBe(true)
            const cfg = JSON.parse(text.slice(text.indexOf("\n") + 1))
            expect(cfg.compilerOptions.strict).toBe(true)
            expect(cfg.include).toEqual(["**/*.ts", "**/*.tsx"])
        })

        it("passes --check when the file is already in sync", async () => {
            const dir = mkdtempSync(path.join(tmpdir(), "vial-owned-"))
            await ownedTsconfig(OPTS, false, dir)
            await expect(ownedTsconfig(OPTS, true, dir)).resolves.toBe(path.join(dir, "tsconfig.json"))
        })

        it("fails --check when the tsconfig is missing or stale", async () => {
            const dir = mkdtempSync(path.join(tmpdir(), "vial-owned-"))
            const error = await ownedTsconfig(OPTS, true, dir).catch((thrown) => thrown)
            expect(error).toBeInstanceOf(CmdoreError)
            expect(error.exitCode).toBe(1)
        })
    })

    context("resolveTurboConfig", () => {
        const TASKS = BUILTIN.tasks

        it("scaffolds a default (unheadered) turbo.json when there is no vial.config", async () => {
            const dir = mkdtempSync(path.join(tmpdir(), "vial-turbo-"))
            await resolveTurboConfig(TASKS, dir)
            const text = readFileSync(path.join(dir, "turbo.json"), "utf8")
            expect(text.startsWith("//")).toBe(false)
            const cfg = JSON.parse(text)
            expect(cfg.$schema).toContain("turbo")
            expect(cfg.tasks.build.outputs).toEqual(["dist/**"])
        })

        it("owns a headered turbo.json when a vial.config exists", async () => {
            const dir = mkdtempSync(path.join(tmpdir(), "vial-turbo-"))
            writeFileSync(path.join(dir, "vial.config.json"), "{}")
            await resolveTurboConfig(TASKS, dir)
            expect(readFileSync(path.join(dir, "turbo.json"), "utf8").startsWith("// Generated by vial")).toBe(true)
        })

        it("leaves an existing turbo.json untouched without a vial.config", async () => {
            const dir = mkdtempSync(path.join(tmpdir(), "vial-turbo-"))
            const file = path.join(dir, "turbo.json")
            writeFileSync(file, '{"marker":true}')
            await resolveTurboConfig(TASKS, dir)
            expect(JSON.parse(readFileSync(file, "utf8")).marker).toBe(true)
        })
    })

    context("provided flags", () => {
        afterEach(() => setProvidedFlags(new Set()))

        it("parses long and short option tokens, ignoring values and the -- separator", () => {
            const flags = parseProvidedFlags(["build", "src/index.ts", "--minify", "-t", "node", "--outdir=dist", "--"])
            expect([...flags].sort()).toEqual(["minify", "outdir", "t"])
        })

        it("whenProvided returns the value only for typed flags, by name or alias", () => {
            setProvidedFlags(new Set(["minify", "t"]))
            expect(whenProvided({ name: "minify" }, true)).toBe(true)
            expect(whenProvided({ name: "target", alias: "t" }, "node")).toBe("node")
            expect(whenProvided({ name: "sourcemap" }, true)).toBeUndefined()
        })
    })

    context("withPaths", () => {
        it("defaults to the current directory when empty", () => {
            expect(withPaths([])).toEqual(["."])
        })

        it("passes explicit paths through untouched", () => {
            expect(withPaths(["src", "test"])).toEqual(["src", "test"])
        })
    })

    context("targets", () => {
        it.each([
            ["browser", { platform: "browser", viteTarget: "baseline-widely-available" }],
            ["node", { platform: "node", viteTarget: "node18" }],
            ["bun", { platform: "neutral", viteTarget: "esnext" }],
            ["nonsense", { platform: "browser", viteTarget: "baseline-widely-available" }]
        ])("maps %s onto each bundler's vocabulary", (target, expected) => {
            expect(targets(target)).toEqual(expected)
        })
    })

    context("biomeConfig", () => {
        it("generates biome.json from the merged config", () => {
            const config = JSON.parse(readFileSync(path.join(biomeConfig(BUILTIN), "biome.json"), "utf8"))
            expect(config.formatter.indentWidth).toBe(4)
            expect(config.javascript.formatter.quoteStyle).toBe("double")
            expect(config.javascript.formatter.semicolons).toBe("asNeeded")
            expect(config.linter.rules.recommended).toBe(true)
        })

        it("excludes the build outDir and caches so generated files are not linted or formatted", () => {
            const config = JSON.parse(readFileSync(path.join(biomeConfig(BUILTIN), "biome.json"), "utf8"))
            expect(config.files.includes).toContain(`!**/${BUILTIN.build.outDir}/**`)
            expect(config.files.includes).toEqual(expect.arrayContaining(["!**/node_modules/**", "!**/coverage/**"]))
        })
    })

    context("run", () => {
        beforeEach(() => {
            spawn.mockReset()
        })

        it("spawns the resolved bin under vial's runtime with the given args", async () => {
            spawn.mockReturnValue(spawnResult({ status: 0 }))
            await run("vite")(["build", "--config", "x"])
            expect(spawn).toHaveBeenCalledTimes(1)
            const [command, argv, options] = spawn.mock.calls[0] as unknown as [string, string[], { stdio: string }]
            expect(command).toBe(process.execPath)
            expect(argv[0] ?? "").toContain("vite.js")
            expect(argv.slice(1)).toEqual(["build", "--config", "x"])
            expect(options.stdio).toBe("inherit")
        })

        it("resolves when the tool exits 0", async () => {
            spawn.mockReturnValue(spawnResult({ status: 0 }))
            await expect(run("vite")([])).resolves.toBeUndefined()
        })

        it("throws a CmdoreError carrying a non-zero exit code", async () => {
            spawn.mockReturnValue(spawnResult({ status: 2 }))
            const error = await run("vite")([]).catch((thrown) => thrown)
            expect(error).toBeInstanceOf(CmdoreError)
            expect(error.exitCode).toBe(2)
        })

        it("maps a signal kill (null status) to exit code 1", async () => {
            spawn.mockReturnValue(spawnResult({ status: null }))
            const error = await run("vite")([]).catch((thrown) => thrown)
            expect(error).toBeInstanceOf(CmdoreError)
            expect(error.exitCode).toBe(1)
        })

        it("throws when the process fails to spawn, naming the tool", async () => {
            spawn.mockReturnValue(spawnResult({ error: new Error("ENOENT") }))
            const error = await run("@biomejs/biome")([]).catch((thrown) => thrown)
            expect(error).toBeInstanceOf(CmdoreError)
            expect(error.exitCode).toBe(1)
            expect(error.message).toContain("biome")
        })
    })

    context("detectConfig", () => {
        // Runs in vial's own package dir, which has tsconfig.json, vitest.config.ts,
        // and build.config.ts, but no vite.config or biome.json.
        it("finds a tool's project config in the cwd", () => {
            expect(detectConfig("tsc")?.endsWith("tsconfig.json")).toBe(true)
            expect(detectConfig("vitest")?.endsWith("vitest.config.ts")).toBe(true)
            expect(detectConfig("unbuild")?.endsWith("build.config.ts")).toBe(true)
        })

        it("returns an absolute path", () => {
            expect(path.isAbsolute(detectConfig("tsc") ?? "")).toBe(true)
        })

        it("returns undefined when no config exists for the tool", () => {
            expect(detectConfig("biome")).toBeUndefined()
            expect(detectConfig("nonsense")).toBeUndefined()
        })
    })

    context("passthrough", () => {
        beforeEach(() => {
            spawn.mockReset()
            spawn.mockReturnValue(spawnResult({ status: 0 }))
        })
        afterEach(() => {
            setPassthrough([])
        })

        it("appends forwarded args after the command's own args", async () => {
            setPassthrough(["--reporter=json", "--bail=1"])
            await run("vitest")(["--config", "x"])
            expect(argvOf(0).slice(1)).toEqual(["--config", "x", "--reporter=json", "--bail=1"])
        })

        it("adds nothing when unset", async () => {
            await run("vite")(["build"])
            expect(argvOf(0).slice(1)).toEqual(["build"])
        })
    })

    context("runBiome", () => {
        beforeEach(() => {
            spawn.mockReset()
            spawn.mockReturnValue(spawnResult({ status: 0 }))
        })

        it("runs the subcommand with the given config and applies fixes over the given paths", async () => {
            await runBiome("lint", true, ["src"], "/cfg/biome.json")
            const argv = argvOf(0)
            expect((argv[0] ?? "").endsWith(path.join("bin", "biome"))).toBe(true)
            expect(argv[1]).toBe("lint")
            expect(argv[2]).toBe("--config-path=/cfg/biome.json")
            expect(argv.slice(3)).toEqual(["--write", "src"])
        })

        it("omits --write and defaults to the current directory when not applying", async () => {
            await runBiome("format", false, [], "/cfg/biome.json")
            const argv = argvOf(0)
            expect(argv[1]).toBe("format")
            expect(argv.slice(3)).toEqual(["."])
        })

        it("points --config-path at a user config when given", async () => {
            await runBiome("lint", false, ["src"], "/my/biome.json")
            expect(argvOf(0)[2]).toBe("--config-path=/my/biome.json")
        })
    })
})
