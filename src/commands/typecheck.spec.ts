import { typecheckCommand } from "./typecheck"

const h = vi.hoisted(() => ({
    runCalls: [] as string[][],
    hasWebanvilConfig: vi.fn((): boolean => false),
    detectConfig: vi.fn((): string | undefined => undefined),
    tempTsconfig: vi.fn((): string => "TEMP"),
    scaffoldTsconfig: vi.fn((): Promise<string> => Promise.resolve("SCAFFOLD")),
    ownedTsconfig: vi.fn((_options: Record<string, unknown>, _check: boolean): Promise<string> => Promise.resolve("OWNED"))
}))

vi.mock("../config", () => ({
    loadWebanvilConfig: (): Promise<unknown> => Promise.resolve({ typecheck: { compilerOptions: { strict: true } } }),
    hasWebanvilConfig: h.hasWebanvilConfig
}))

vi.mock("../tools", () => ({
    run:
        () =>
        (args: string[]): Promise<void> => {
            h.runCalls.push(args)
            return Promise.resolve()
        },
    detectConfig: h.detectConfig,
    tempTsconfig: h.tempTsconfig,
    scaffoldTsconfig: h.scaffoldTsconfig,
    ownedTsconfig: h.ownedTsconfig
}))

/** The value passed right after `--project` in the most recent run() call. */
const projectArg = (): string | undefined => {
    const args = h.runCalls.at(-1) ?? []
    const index = args.indexOf("--project")
    return index === -1 ? undefined : args[index + 1]
}

const run = (over: { config?: string; noScaffold?: boolean; watch?: boolean; check?: boolean } = {}) =>
    typecheckCommand.run({
        watch: over.watch ?? false,
        config: over.config,
        "no-scaffold": over.noScaffold ?? false,
        check: over.check ?? false
    })

describe("typecheck tsconfig resolution", () => {
    const realIsTTY = process.stdout.isTTY
    beforeEach(() => {
        h.runCalls.length = 0
        h.hasWebanvilConfig.mockReturnValue(false)
        h.detectConfig.mockReturnValue(undefined)
        h.tempTsconfig.mockClear()
        h.scaffoldTsconfig.mockClear()
        h.ownedTsconfig.mockClear()
    })
    afterAll(() => {
        process.stdout.isTTY = realIsTTY
    })

    context("without a webanvil.config", () => {
        it("scaffolds a root tsconfig when interactive and none is detected", async () => {
            process.stdout.isTTY = true
            await run()
            expect(h.scaffoldTsconfig).toHaveBeenCalledOnce()
            expect(h.tempTsconfig).not.toHaveBeenCalled()
            expect(projectArg()).toBe("SCAFFOLD")
        })

        it("uses a throwaway config when non-interactive, leaving the tree untouched", async () => {
            process.stdout.isTTY = false
            await run()
            expect(h.tempTsconfig).toHaveBeenCalledOnce()
            expect(h.scaffoldTsconfig).not.toHaveBeenCalled()
            expect(projectArg()).toBe("TEMP")
        })

        it("skips scaffolding on a TTY when --no-scaffold is set", async () => {
            process.stdout.isTTY = true
            await run({ noScaffold: true })
            expect(h.tempTsconfig).toHaveBeenCalledOnce()
            expect(h.scaffoldTsconfig).not.toHaveBeenCalled()
            expect(projectArg()).toBe("TEMP")
        })

        it("uses a detected tsconfig without writing anything, even on a TTY", async () => {
            process.stdout.isTTY = true
            h.detectConfig.mockReturnValue("DETECTED")
            await run()
            expect(projectArg()).toBe("DETECTED")
            expect(h.scaffoldTsconfig).not.toHaveBeenCalled()
            expect(h.tempTsconfig).not.toHaveBeenCalled()
        })
    })

    context("with a webanvil.config (webanvil owns the tsconfig)", () => {
        beforeEach(() => h.hasWebanvilConfig.mockReturnValue(true))

        it("regenerates the root tsconfig, bypassing detection and scaffolding", async () => {
            process.stdout.isTTY = true
            h.detectConfig.mockReturnValue("DETECTED")
            await run()
            expect(h.ownedTsconfig).toHaveBeenCalledOnce()
            expect(h.scaffoldTsconfig).not.toHaveBeenCalled()
            expect(projectArg()).toBe("OWNED")
        })

        it("forwards --check to the owned-tsconfig verification", async () => {
            await run({ check: true })
            expect(h.ownedTsconfig.mock.calls[0]?.[1]).toBe(true)
        })
    })

    it("prefers --config over detection, scaffolding, and ownership", async () => {
        process.stdout.isTTY = true
        h.hasWebanvilConfig.mockReturnValue(true)
        h.detectConfig.mockReturnValue("DETECTED")
        await run({ config: "USER" })
        expect(projectArg()).toBe("USER")
        expect(h.ownedTsconfig).not.toHaveBeenCalled()
        expect(h.scaffoldTsconfig).not.toHaveBeenCalled()
    })

    it("appends --watch when watching", async () => {
        process.stdout.isTTY = false
        await run({ watch: true })
        expect(h.runCalls.at(-1)).toContain("--watch")
    })
})
