import {
    buildCommand,
    bundleCommand,
    devCommand,
    formatCommand,
    lintCommand,
    previewCommand,
    serveCommand,
    testCommand,
    typecheckCommand
} from "."

type RunCall = { pkg: string; args: string[] }

// Shared spy state, hoisted so the vi.mock factories below can close over it.
const h = vi.hoisted(() => ({
    runCalls: [] as RunCall[],
    biomeCalls: [] as { configPath?: string }[],
    detectConfig: vi.fn((): string | undefined => undefined),
    // A merged config stand-in; its values are irrelevant here since the generators' output is
    // mocked to a sentinel. These specs assert config-path precedence, not generated content.
    resolved: {
        target: "browser",
        build: { outDir: "dist", declaration: true, clean: true, sourcemap: false, minify: false },
        bundle: { minify: false, sourcemap: false },
        dev: { port: 3000, host: "localhost" },
        preview: { port: 3000, host: "localhost" },
        test: { environment: "node", globals: true, coverage: false },
        typecheck: { compilerOptions: {} },
        format: { indentStyle: "space", indentWidth: 4, lineWidth: 120, quoteStyle: "double", semicolons: "asNeeded" },
        lint: { rules: "recommended" }
    }
}))

vi.mock("../config", () => ({
    loadVialConfig: (): Promise<unknown> => Promise.resolve(h.resolved),
    hasVialConfig: (): boolean => false
}))

vi.mock("../tools", () => ({
    run:
        (pkg: string) =>
        (args: string[]): Promise<void> => {
            h.runCalls.push({ pkg, args })
            return Promise.resolve()
        },
    runBiome: (_subcommand: string, _apply: boolean, _paths: string[], configPath?: string): Promise<void> => {
        h.biomeCalls.push({ configPath })
        return Promise.resolve()
    },
    detectConfig: h.detectConfig,
    writeConfig: (): string => "GENERATED",
    writeJsonConfig: (): string => "GENERATED",
    watchBuild: (): Promise<void> => Promise.resolve(),
    biomeConfig: (): string => "GENERATED",
    tempTsconfig: (): string => "GENERATED",
    scaffoldTsconfig: (): Promise<string> => Promise.resolve("SCAFFOLD"),
    ownedTsconfig: (): Promise<string> => Promise.resolve("OWNED"),
    whenProvided: (): undefined => undefined,
    targets: () => ({ platform: "PLATFORM", viteTarget: "VITE_TARGET" })
}))

/** The value passed right after `flag` in the most recent run() spawn. */
const lastConfig = (flag: string): string | undefined => {
    const call = h.runCalls.at(-1)
    if (call == null) {
        return undefined
    }
    const index = call.args.indexOf(flag)
    return index === -1 ? undefined : call.args[index + 1]
}

type Case = { name: string; flag: string; run: (config?: string) => unknown }

const CASES: Case[] = [
    {
        name: "build",
        flag: "--config",
        run: (config) =>
            buildCommand.run({
                entry: "e.ts",
                app: false,
                outdir: "dist",
                target: "browser",
                minify: false,
                sourcemap: false,
                watch: false,
                config
            })
    },
    {
        name: "bundle",
        flag: "--config",
        run: (config) =>
            bundleCommand.run({
                entry: "e.ts",
                outfile: "dist/b.js",
                target: "browser",
                minify: false,
                sourcemap: false,
                watch: false,
                config
            })
    },
    {
        name: "dev",
        flag: "--config",
        run: (config) => devCommand.run({ root: ".", port: "3000", host: "localhost", config })
    },
    {
        name: "serve",
        flag: "--config",
        run: (config) => serveCommand.run({ root: ".", port: "3000", host: "localhost", config })
    },
    {
        name: "preview",
        flag: "--config",
        run: (config) => previewCommand.run({ dir: ".", port: "3000", host: "localhost", config })
    },
    {
        name: "test",
        flag: "--config",
        run: (config) => testCommand.run({ patterns: [], watch: false, coverage: false, config })
    },
    {
        name: "typecheck",
        flag: "--project",
        run: (config) => typecheckCommand.run({ watch: false, config, "no-scaffold": false, check: false })
    }
]

const BIOME_CASES: { name: string; run: (config?: string) => unknown }[] = [
    { name: "lint", run: (config) => lintCommand.run({ paths: [], fix: false, config }) },
    { name: "format", run: (config) => formatCommand.run({ paths: [], check: false, config }) }
]

describe("config precedence (generated < detected < --config)", () => {
    // typecheck scaffolds a root tsconfig only on a TTY; pin non-interactive so the "generated
    // default" case deterministically takes the throwaway (tempTsconfig) path.
    const realIsTTY = process.stdout.isTTY
    beforeEach(() => {
        h.runCalls.length = 0
        h.biomeCalls.length = 0
        h.detectConfig.mockReturnValue(undefined)
        process.stdout.isTTY = false
    })
    afterAll(() => {
        process.stdout.isTTY = realIsTTY
    })

    describe.each(CASES)("$name", ({ flag, run }) => {
        it("uses vial's generated config when neither --config nor a repo config exists", async () => {
            await run(undefined)
            expect(lastConfig(flag)).toBe("GENERATED")
        })

        it("prefers a detected repo config over the generated one", async () => {
            h.detectConfig.mockReturnValue("DETECTED")
            await run(undefined)
            expect(lastConfig(flag)).toBe("DETECTED")
        })

        it("prefers --config over a detected repo config", async () => {
            h.detectConfig.mockReturnValue("DETECTED")
            await run("USER")
            expect(lastConfig(flag)).toBe("USER")
        })
    })

    describe.each(BIOME_CASES)("$name (biome)", ({ run }) => {
        it("uses vial's generated biome config by default", async () => {
            await run(undefined)
            expect(h.biomeCalls.at(-1)?.configPath).toBe("GENERATED")
        })

        it("prefers a detected repo config over the generated one", async () => {
            h.detectConfig.mockReturnValue("DETECTED")
            await run(undefined)
            expect(h.biomeCalls.at(-1)?.configPath).toBe("DETECTED")
        })

        it("prefers --config over a detected repo config", async () => {
            h.detectConfig.mockReturnValue("DETECTED")
            await run("USER")
            expect(h.biomeCalls.at(-1)?.configPath).toBe("USER")
        })
    })
})
