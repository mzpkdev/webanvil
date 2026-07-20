import { bundleCommand } from "./bundle"

type RunCall = { pkg: string; args: string[] }

const h = vi.hoisted(() => ({ runCalls: [] as RunCall[] }))

vi.mock("../config", () => ({
    loadVialConfig: (): Promise<unknown> =>
        Promise.resolve({ target: "browser", bundle: { minify: false, sourcemap: false } })
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
    whenProvided: (): undefined => undefined,
    targets: () => ({ platform: "browser", viteTarget: "baseline-widely-available" })
}))

const argv = (over: { watch?: boolean } = {}) => ({
    entry: "src/index.ts",
    outfile: "dist/b.js",
    target: "browser",
    minify: false,
    sourcemap: false,
    watch: over.watch ?? false,
    config: undefined
})

describe("bundle watch mode", () => {
    beforeEach(() => {
        h.runCalls.length = 0
    })

    it("runs vite build without --watch by default", async () => {
        await bundleCommand.run(argv())
        expect(h.runCalls[0]?.args[0]).toBe("build")
        expect(h.runCalls[0]?.args).not.toContain("--watch")
    })

    it("passes --watch straight through to vite build", async () => {
        await bundleCommand.run(argv({ watch: true }))
        expect(h.runCalls[0]?.args).toContain("--watch")
    })
})
