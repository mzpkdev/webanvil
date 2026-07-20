import path from "node:path"
import { devCommand, serveCommand } from "./dev"

type RunCall = { pkg: string; args: string[] }

const h = vi.hoisted(() => ({
    runCalls: [] as RunCall[],
    jsonConfigs: [] as object[],
    detectConfig: vi.fn((): string | undefined => undefined)
}))

vi.mock("../config", () => ({
    // Distinct port/host so the generated config asserts it reads the merged values, not option defaults.
    loadVialConfig: (): Promise<unknown> => Promise.resolve({ dev: { port: 4321, host: "0.0.0.0" } })
}))

vi.mock("../tools", () => ({
    run:
        (pkg: string) =>
        (args: string[]): Promise<void> => {
            h.runCalls.push({ pkg, args })
            return Promise.resolve()
        },
    detectConfig: h.detectConfig,
    writeJsonConfig: (_name: string, config: object): string => {
        h.jsonConfigs.push(config)
        return "GENERATED"
    },
    whenProvided: (): undefined => undefined
}))

const lastRun = (): RunCall | undefined => h.runCalls.at(-1)
const lastJson = (): object | undefined => h.jsonConfigs.at(-1)
const argv = (root: string, config?: string) => ({ root, port: "3000", host: "localhost", config })

describe("dev server", () => {
    beforeEach(() => {
        h.runCalls.length = 0
        h.jsonConfigs.length = 0
        h.detectConfig.mockReturnValue(undefined)
    })

    it("runs vite's dev subcommand against the generated config", async () => {
        await devCommand.run(argv("."))
        expect(lastRun()?.pkg).toBe("vite")
        expect(lastRun()?.args[0]).toBe("dev")
        expect(lastRun()?.args).toContain("--config")
        expect(lastRun()?.args).toContain("GENERATED")
    })

    it("serves source straight from the resolved root with the merged port and host", async () => {
        await devCommand.run(argv("app"))
        expect(lastJson()).toEqual({ root: path.resolve("app"), server: { port: 4321, host: "0.0.0.0" } })
    })

    it("serve is an alias: it shares dev's handler and same vite dev invocation", async () => {
        await serveCommand.run(argv("."))
        expect(lastRun()?.args[0]).toBe("dev")
        expect(serveCommand.run).toBe(devCommand.run)
    })

    it("prefers a detected vite config over the generated one", async () => {
        h.detectConfig.mockReturnValue("DETECTED")
        await devCommand.run(argv("."))
        expect(lastRun()?.args).toContain("DETECTED")
        expect(h.jsonConfigs).toHaveLength(0)
    })
})
