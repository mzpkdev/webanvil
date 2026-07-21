import { initCommand } from "./init"

const h = vi.hoisted(() => ({
    writes: [] as { file: string; contents: string }[],
    existing: new Set<string>(),
    hasWebanvilConfig: vi.fn((): boolean => false)
}))

// Basename-keyed fs so assertions ignore the temp cwd prefix.
const base = (p: string): string => p.split("/").pop() ?? p

vi.mock("node:fs", () => ({
    existsSync: (p: string): boolean => h.existing.has(base(p)),
    writeFileSync: (p: string, contents: string): void => {
        h.writes.push({ file: base(p), contents })
    }
}))

vi.mock("../config", () => ({
    hasWebanvilConfig: h.hasWebanvilConfig,
    BUILTIN: { typecheck: { compilerOptions: { strict: true } } }
}))

vi.mock("../tools", () => ({ ownedTsconfigText: (): string => "TSCONFIG" }))

const names = (): string[] => h.writes.map((w) => w.file)
const bodyOf = (file: string): string | undefined => h.writes.find((w) => w.file === file)?.contents

describe("init scaffolding", () => {
    beforeEach(() => {
        h.writes.length = 0
        h.existing.clear()
        h.hasWebanvilConfig.mockReturnValue(false)
    })

    it("writes a JSON config (with a $schema pointer), tsconfig, and .gitignore by default", async () => {
        await initCommand.run({ ts: false, force: false })
        expect(names()).toEqual(["webanvil.config.json", "tsconfig.json", ".gitignore"])
        expect(bodyOf("webanvil.config.json")).toContain("./node_modules/@crazy-pocs/webanvil/webanvil.schema.json")
        expect(bodyOf("tsconfig.json")).toBe("TSCONFIG")
    })

    it("scaffolds a typed webanvil.config.ts under --ts, never the JSON variant", async () => {
        await initCommand.run({ ts: true, force: false })
        expect(names()).toContain("webanvil.config.ts")
        expect(names()).not.toContain("webanvil.config.json")
        expect(bodyOf("webanvil.config.ts")).toContain("satisfies WebanvilConfig")
    })

    it("never clobbers existing files", async () => {
        h.hasWebanvilConfig.mockReturnValue(true) // a webanvil.config in any extension already exists
        h.existing.add("tsconfig.json")
        h.existing.add(".gitignore")
        await initCommand.run({ ts: false, force: false })
        expect(h.writes).toHaveLength(0)
    })

    it("overwrites everything under --force", async () => {
        h.hasWebanvilConfig.mockReturnValue(true)
        h.existing.add("tsconfig.json")
        h.existing.add(".gitignore")
        await initCommand.run({ ts: false, force: true })
        expect(names()).toEqual(["webanvil.config.json", "tsconfig.json", ".gitignore"])
    })
})
