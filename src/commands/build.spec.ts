import { buildCommand } from "./build"

type RunCall = { pkg: string; args: string[] }

const h = vi.hoisted(() => ({
    runCalls: [] as RunCall[],
    watchCalls: [] as { root: string; outDir: string }[],
    indexHtml: false
}))

vi.mock("../config", () => ({
    loadWebanvilConfig: (): Promise<unknown> => Promise.resolve({ target: "node", build: { outDir: "dist" } })
}))

vi.mock("../frameworks", () => ({
    detectPlugins: (): { imports: string[]; calls: string[] } => ({ imports: [], calls: [] })
}))

vi.mock("node:fs", () => ({
    existsSync: (p: string): boolean => (String(p).endsWith("index.html") ? h.indexHtml : false)
}))

vi.mock("../tools", () => ({
    run:
        (pkg: string) =>
        (args: string[]): Promise<void> => {
            h.runCalls.push({ pkg, args })
            return Promise.resolve()
        },
    detectConfig: (): undefined => undefined,
    writeConfig: (): string => "GENERATED",
    writeJsonConfig: (): string => "GENERATED",
    whenProvided: (): undefined => undefined,
    targets: () => ({ platform: "node", viteTarget: "node18" }),
    // Stand-in watcher: record the scope it was handed, then drive the build task once.
    watchBuild: async (root: string, outDir: string, task: () => Promise<void>): Promise<void> => {
        h.watchCalls.push({ root, outDir })
        await task()
    }
}))

const argv = (over: { watch?: boolean } = {}) => ({
    entry: "src/index.ts",
    app: false,
    outdir: "dist",
    target: "node",
    minify: false,
    sourcemap: false,
    watch: over.watch ?? false,
    config: undefined
})

describe("build watch mode", () => {
    beforeEach(() => {
        h.runCalls.length = 0
        h.watchCalls.length = 0
        h.indexHtml = false
    })

    it("runs unbuild once and does not watch by default", async () => {
        await buildCommand.run(argv())
        expect(h.watchCalls).toHaveLength(0)
        expect(h.runCalls.map((c) => c.pkg)).toEqual(["unbuild"])
    })

    it("delegates to the watcher under --watch, scoped to the entry dir and outDir", async () => {
        await buildCommand.run(argv({ watch: true }))
        expect(h.watchCalls).toHaveLength(1)
        expect(h.watchCalls[0]?.root.endsWith(`${"/"}src`)).toBe(true)
        expect(h.watchCalls[0]?.outDir).toBe("dist")
        // the watcher drove the build task it was handed
        expect(h.runCalls.map((c) => c.pkg)).toEqual(["unbuild"])
    })

    it("builds an app (vite build) when index.html is present and no entry is given", async () => {
        h.indexHtml = true
        await buildCommand.run({
            entry: undefined,
            app: false,
            outdir: "dist",
            target: "browser",
            minify: false,
            sourcemap: false,
            watch: false,
            config: undefined
        })
        expect(h.runCalls.at(-1)?.pkg).toBe("vite")
        expect(h.runCalls.at(-1)?.args[0]).toBe("build")
    })

    it("forces an app build under --app even without index.html", async () => {
        h.indexHtml = false
        await buildCommand.run({
            entry: undefined,
            app: true,
            outdir: "dist",
            target: "browser",
            minify: false,
            sourcemap: false,
            watch: false,
            config: undefined
        })
        expect(h.runCalls.at(-1)?.pkg).toBe("vite")
    })

    it("builds a library (unbuild) when an entry is given", async () => {
        h.indexHtml = false
        await buildCommand.run({
            entry: "src/index.ts",
            app: false,
            outdir: "dist",
            target: "node",
            minify: false,
            sourcemap: false,
            watch: false,
            config: undefined
        })
        expect(h.runCalls.at(-1)?.pkg).toBe("unbuild")
    })
})
