import { cleanCommand } from "./clean"

const h = vi.hoisted(() => ({
    removed: [] as string[],
    // null => every candidate path exists; otherwise only these basenames exist.
    existing: null as Set<string> | null,
    config: {} as Record<string, unknown>
}))

const base = (p: string): string => p.split("/").pop() ?? p

vi.mock("node:fs", () => ({
    existsSync: (p: string): boolean => (h.existing ? h.existing.has(base(p)) : true),
    rmSync: (p: string): void => {
        h.removed.push(base(p))
    }
}))

vi.mock("../config", () => ({ loadWebanvilConfig: (): Promise<unknown> => Promise.resolve(h.config) }))

const run = (deep = false): unknown => cleanCommand.run({ deep })

describe("clean", () => {
    beforeEach(() => {
        h.removed.length = 0
        h.existing = null
        h.config = {
            build: { outDir: "dist" },
            tasks: { build: { outputs: ["dist/**"] }, test: { outputs: ["coverage/**"] }, lint: {} }
        }
    })

    it("removes the outDir, declared output bases, and tool caches", async () => {
        await run()
        expect(h.removed).toEqual(expect.arrayContaining(["dist", "coverage", ".turbo", ".cache", ".vite"]))
    })

    it("dedupes the outDir against the matching output glob (dist removed once)", async () => {
        await run()
        expect(h.removed.filter((r) => r === "dist")).toHaveLength(1)
    })

    it("protects src and node_modules by default", async () => {
        h.config = { build: { outDir: "src" }, tasks: {} } // pathological outDir; must still be spared
        await run()
        expect(h.removed).not.toContain("src")
        expect(h.removed).not.toContain("node_modules")
    })

    it("removes node_modules only under --deep", async () => {
        await run(false)
        expect(h.removed).not.toContain("node_modules")
        h.removed.length = 0
        await run(true)
        expect(h.removed).toContain("node_modules")
    })

    it("skips targets that do not exist", async () => {
        h.existing = new Set([".turbo"])
        await run()
        expect(h.removed).toEqual([".turbo"])
    })

    it("lists without removing under --dry-run", async () => {
        const { effect } = await import("cmdore")
        effect.enabled = false
        try {
            await run()
        } finally {
            effect.enabled = true
        }
        expect(h.removed).toHaveLength(0)
    })
})
