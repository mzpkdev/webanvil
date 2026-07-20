import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { findWorkspaceRoot, workspacePackages } from "./workspace"

/** A throwaway workspace: root manifest with `workspaces`, plus packages under packages/<name>. */
const workspace = (packages: Record<string, { scripts?: Record<string, string> }>): string => {
    const root = mkdtempSync(path.join(tmpdir(), "vial-ws-"))
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "root", workspaces: ["packages/*"] }))
    for (const [name, manifest] of Object.entries(packages)) {
        const dir = path.join(root, "packages", name)
        mkdirSync(dir, { recursive: true })
        writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: `@ws/${name}`, ...manifest }))
    }
    return root
}

describe("findWorkspaceRoot", () => {
    it("walks up from a nested dir to the nearest manifest with workspaces", () => {
        const root = workspace({ web: {} })
        expect(findWorkspaceRoot(path.join(root, "packages", "web"))).toBe(root)
    })

    it("is undefined outside any workspace", () => {
        const solo = mkdtempSync(path.join(tmpdir(), "vial-solo-"))
        writeFileSync(path.join(solo, "package.json"), JSON.stringify({ name: "solo" }))
        expect(findWorkspaceRoot(solo)).toBeUndefined()
    })
})

describe("workspacePackages", () => {
    it("expands dir/* to each package with its name and scripts", () => {
        const root = workspace({ web: { scripts: { test: "vitest" } }, api: {} })
        const found = workspacePackages(root)
        expect(found.map((p) => p.name).sort()).toEqual(["@ws/api", "@ws/web"])
        expect(found.find((p) => p.name === "@ws/web")?.scripts.test).toBe("vitest")
        expect(found.find((p) => p.name === "@ws/api")?.scripts).toEqual({})
    })

    it("is empty when the root manifest declares no workspaces", () => {
        const solo = mkdtempSync(path.join(tmpdir(), "vial-solo-"))
        writeFileSync(path.join(solo, "package.json"), JSON.stringify({ name: "solo" }))
        expect(workspacePackages(solo)).toEqual([])
    })
})
