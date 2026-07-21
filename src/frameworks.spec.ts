import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { detectPlugins } from "./frameworks"

/** A temp package dir listing `deps`, optionally with a fake installed plugin so `require.resolve`
 *  from the package succeeds. */
const pkgDir = (deps: string[], installedPlugin?: string): string => {
    const dir = mkdtempSync(path.join(tmpdir(), "webanvil-fw-"))
    writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "app", dependencies: Object.fromEntries(deps.map((d) => [d, "*"])) })
    )
    if (installedPlugin) {
        const mod = path.join(dir, "node_modules", installedPlugin)
        mkdirSync(mod, { recursive: true })
        writeFileSync(path.join(mod, "package.json"), JSON.stringify({ name: installedPlugin, main: "index.js" }))
        writeFileSync(path.join(mod, "index.js"), "module.exports = () => ({})")
    }
    return dir
}

describe("detectPlugins", () => {
    it("wires an installed framework plugin by absolute path", () => {
        const dir = pkgDir(["react"], "@vitejs/plugin-react")
        const wiring = detectPlugins(dir)
        expect(wiring.calls).toEqual(["react()"])
        expect(wiring.imports[0] ?? "").toMatch(/^import react from ".*plugin-react.*"$/)
    })

    it("skips a framework whose plugin is not installed", () => {
        expect(detectPlugins(pkgDir(["vue"]))).toEqual({ imports: [], calls: [] })
    })

    it("is empty for a package with no known framework", () => {
        expect(detectPlugins(pkgDir([]))).toEqual({ imports: [], calls: [] })
    })
})
