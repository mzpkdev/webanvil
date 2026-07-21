import { runCommand } from "./run"

const h = vi.hoisted(() => ({
    execCalls: [] as string[][],
    webanvilRuns: [] as { dir: string; args: string[] }[],
    resolveTurbo: vi.fn((): Promise<void> => Promise.resolve()),
    passthrough: [] as string[],
    root: undefined as string | undefined,
    packages: [] as { dir: string; name: string; scripts: Record<string, string> }[]
}))

vi.mock("../config", () => ({
    loadWebanvilConfig: (): Promise<unknown> => Promise.resolve({ tasks: { build: { outputs: ["dist/**"] } } })
}))

vi.mock("../tools", () => ({
    exec:
        () =>
        (args: string[]): Promise<void> => {
            h.execCalls.push(args)
            return Promise.resolve()
        },
    execWebanvilIn: (dir: string, args: string[]): Promise<void> => {
        h.webanvilRuns.push({ dir, args })
        return Promise.resolve()
    },
    getPassthrough: (): readonly string[] => h.passthrough,
    resolveTurboConfig: h.resolveTurbo
}))

vi.mock("../workspace", () => ({
    findWorkspaceRoot: (): string | undefined => h.root,
    workspacePackages: (): unknown[] => h.packages
}))

const lastArgs = (): string[] => h.execCalls.at(-1) ?? []

describe("run command", () => {
    beforeEach(() => {
        h.execCalls.length = 0
        h.webanvilRuns.length = 0
        h.passthrough = []
        h.root = undefined
        h.packages = []
        h.resolveTurbo.mockClear()
    })

    it("ensures turbo.json, then runs the task through turbo", async () => {
        await runCommand.run({ task: "build", filter: undefined })
        expect(h.resolveTurbo).toHaveBeenCalledOnce()
        expect(lastArgs()).toEqual(["run", "build"])
    })

    it("forwards --filter to turbo", async () => {
        await runCommand.run({ task: "test", filter: "web" })
        expect(lastArgs()).toEqual(["run", "test", "--filter", "web"])
    })

    it("routes passthrough to the script after turbo's --", async () => {
        h.passthrough = ["--coverage"]
        await runCommand.run({ task: "test", filter: undefined })
        expect(lastArgs()).toEqual(["run", "test", "--", "--coverage"])
    })

    it("runs webanvil <task> in workspace packages that lack the script", async () => {
        h.root = "/ws"
        h.packages = [
            { dir: "/ws/packages/web", name: "web", scripts: { test: "vitest" } },
            { dir: "/ws/packages/api", name: "api", scripts: {} }
        ]
        await runCommand.run({ task: "test", filter: undefined })
        expect(h.execCalls).toHaveLength(1) // turbo ran (web has the script)
        expect(h.webanvilRuns).toEqual([{ dir: "/ws/packages/api", args: ["test"] }])
    })

    it("skips turbo when no package declares the script, still covers them directly", async () => {
        h.root = "/ws"
        h.packages = [{ dir: "/ws/packages/api", name: "api", scripts: {} }]
        await runCommand.run({ task: "lint", filter: undefined })
        expect(h.execCalls).toHaveLength(0) // turbo not invoked (no package declares the script)
        expect(h.webanvilRuns).toEqual([{ dir: "/ws/packages/api", args: ["lint"] }])
    })

    it("does not auto-run a non-webanvil-runnable task (build) in scriptless packages", async () => {
        h.root = "/ws"
        h.packages = [{ dir: "/ws/packages/api", name: "api", scripts: {} }]
        await runCommand.run({ task: "build", filter: undefined })
        expect(h.webanvilRuns).toEqual([])
    })

    it("honors --filter on the direct-run path", async () => {
        h.root = "/ws"
        h.packages = [
            { dir: "/ws/packages/web", name: "web", scripts: {} },
            { dir: "/ws/packages/api", name: "api", scripts: {} }
        ]
        await runCommand.run({ task: "test", filter: "web" })
        expect(h.webanvilRuns).toEqual([{ dir: "/ws/packages/web", args: ["test"] }])
    })

    it("forwards passthrough to the direct webanvil run after --", async () => {
        h.root = "/ws"
        h.passthrough = ["--coverage"]
        h.packages = [{ dir: "/ws/packages/api", name: "api", scripts: {} }]
        await runCommand.run({ task: "test", filter: undefined })
        expect(h.webanvilRuns).toEqual([{ dir: "/ws/packages/api", args: ["test", "--", "--coverage"] }])
    })
})
