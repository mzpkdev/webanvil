import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { BUILTIN, configJsonSchema, hasWebanvilConfig, loadWebanvilConfig } from "./config"

/** A throwaway project dir seeded with the given files (name -> JSON contents). */
const project = (files: Record<string, unknown> = {}): string => {
    const dir = mkdtempSync(path.join(tmpdir(), "webanvil-cfg-"))
    for (const [name, contents] of Object.entries(files)) {
        writeFileSync(path.join(dir, name), JSON.stringify(contents))
    }
    return dir
}

describe("loadWebanvilConfig", () => {
    it("falls back to BUILTIN when there is no webanvil.config", async () => {
        const c = await loadWebanvilConfig({}, project())
        expect(c.format.lineWidth).toBe(120)
        expect(c.target).toBe("browser")
        expect(c.typecheck.compilerOptions.strict).toBe(true)
    })

    it("merges a local webanvil.config over BUILTIN, keeping untouched fields", async () => {
        const dir = project({ "webanvil.config.json": { format: { lineWidth: 100 } } })
        const c = await loadWebanvilConfig({}, dir)
        expect(c.format.lineWidth).toBe(100) // from the file
        expect(c.format.indentWidth).toBe(4) // still BUILTIN
    })

    it("layers extends below the local file and above BUILTIN", async () => {
        const dir = project({
            "base.json": { format: { lineWidth: 80, quoteStyle: "single" } },
            "webanvil.config.json": { extends: "./base.json", format: { lineWidth: 100 } }
        })
        const c = await loadWebanvilConfig({}, dir)
        expect(c.format.lineWidth).toBe(100) // file beats extends
        expect(c.format.quoteStyle).toBe("single") // extends beats BUILTIN
        expect(c.format.indentWidth).toBe(4) // BUILTIN fills the rest
    })

    it("layers a package's webanvil.config over the workspace-root config", async () => {
        const root = mkdtempSync(path.join(tmpdir(), "webanvil-wscfg-"))
        writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "root", workspaces: ["packages/*"] }))
        writeFileSync(path.join(root, "webanvil.config.json"), JSON.stringify({ format: { lineWidth: 100 } }))
        const pkg = path.join(root, "packages", "web")
        mkdirSync(pkg, { recursive: true })
        writeFileSync(path.join(pkg, "webanvil.config.json"), JSON.stringify({ target: "browser" }))
        const c = await loadWebanvilConfig({}, pkg)
        expect(c.target).toBe("browser") // package wins
        expect(c.format.lineWidth).toBe(100) // inherited from the workspace root
        expect(c.format.indentWidth).toBe(4) // BUILTIN fills the rest
    })

    it("inherits the workspace-root config when a package has none", async () => {
        const root = mkdtempSync(path.join(tmpdir(), "webanvil-wscfg-"))
        writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "root", workspaces: ["packages/*"] }))
        writeFileSync(path.join(root, "webanvil.config.json"), JSON.stringify({ target: "node" }))
        const pkg = path.join(root, "packages", "api")
        mkdirSync(pkg, { recursive: true })
        const c = await loadWebanvilConfig({}, pkg)
        expect(c.target).toBe("node")
    })

    it("merges the dev server section over BUILTIN", async () => {
        const dir = project({ "webanvil.config.json": { dev: { port: 4000 } } })
        const c = await loadWebanvilConfig({}, dir)
        expect(c.dev.port).toBe(4000) // from the file
        expect(c.dev.host).toBe("localhost") // still BUILTIN
    })

    it("lets explicit overrides win over the file", async () => {
        const dir = project({ "webanvil.config.json": { build: { outDir: "lib" } } })
        const c = await loadWebanvilConfig({ build: { outDir: "cli" } }, dir)
        expect(c.build.outDir).toBe("cli")
    })

    it("does not mutate BUILTIN across loads", async () => {
        await loadWebanvilConfig({}, project({ "webanvil.config.json": { build: { outDir: "lib" } } }))
        expect(BUILTIN.build.outDir).toBe("dist")
    })
})

describe("hasWebanvilConfig", () => {
    it("is false without a webanvil.config file", () => {
        expect(hasWebanvilConfig(project())).toBe(false)
    })

    it("is true when a webanvil.config file is present", () => {
        expect(hasWebanvilConfig(project({ "webanvil.config.json": {} }))).toBe(true)
    })
})

describe("validation", () => {
    it("hard-fails on a wrong-typed field", async () => {
        const dir = project({ "webanvil.config.json": { format: { lineWidth: "wide" } } })
        await expect(loadWebanvilConfig({}, dir)).rejects.toThrow(/invalid webanvil.config/)
    })

    it("hard-fails on an unknown top-level key (a mistyped section)", async () => {
        const dir = project({ "webanvil.config.json": { formatter: { lineWidth: 80 } } })
        await expect(loadWebanvilConfig({}, dir)).rejects.toThrow(/invalid webanvil.config/)
    })

    it("accepts a valid config", async () => {
        const dir = project({ "webanvil.config.json": { format: { lineWidth: 80 }, target: "node" } })
        await expect(loadWebanvilConfig({}, dir)).resolves.toMatchObject({ target: "node" })
    })

    it("accepts a $schema key so a scaffolded webanvil.config.json is not rejected as unknown", async () => {
        const dir = project({ "webanvil.config.json": { $schema: "./webanvil.schema.json", target: "node" } })
        await expect(loadWebanvilConfig({}, dir)).resolves.toMatchObject({ target: "node" })
    })
})

describe("configJsonSchema", () => {
    it("generates an object schema covering the config sections, including $schema and dev", () => {
        const schema = configJsonSchema()
        expect(schema.type).toBe("object")
        expect(Object.keys(schema.properties as Record<string, unknown>)).toEqual(
            expect.arrayContaining(["$schema", "target", "build", "dev", "preview", "test"])
        )
    })
})
