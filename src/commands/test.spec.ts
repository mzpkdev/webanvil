import { testCommand } from "./test"

const h = vi.hoisted(() => ({
    configs: [] as Record<string, unknown>[]
}))

vi.mock("../config", () => ({
    loadVialConfig: (): Promise<unknown> =>
        Promise.resolve({ test: { globals: true, environment: "node", coverage: false } })
}))

vi.mock("../tools", () => ({
    run:
        () =>
        (): Promise<void> =>
            Promise.resolve(),
    detectConfig: (): undefined => undefined,
    writeJsonConfig: (_name: string, config: Record<string, unknown>): string => {
        h.configs.push(config)
        return "GENERATED"
    },
    whenProvided: (): undefined => undefined
}))

const lastVitestConfig = (): { test: Record<string, unknown> } => h.configs.at(-1) as { test: Record<string, unknown> }

describe("test command", () => {
    beforeEach(() => {
        h.configs.length = 0
    })

    it("generates a vitest config that passes when a package has no test files", async () => {
        await testCommand.run({ patterns: [], watch: false, coverage: false, config: undefined })
        expect(lastVitestConfig().test.passWithNoTests).toBe(true)
        expect(lastVitestConfig().test.environment).toBe("node")
    })
})
