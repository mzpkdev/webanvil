import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { execute } from "cmdore"
import { afterEach, describe, describe as context, expect, it } from "vitest"

import formatCommand from "../src/commands/format"
import {
    Toolchain,
    formatResolvedTool,
    optionalTools,
    resolveOptionalTool,
    resolveTool,
    supportedTools,
    type ToolName
} from "../src/core/toolchain"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-toolchain-"))
    directories.push(directory)
    return directory
}

const writeJson = (path: string, value: unknown): Promise<void> =>
    writeFile(path, `${JSON.stringify(value, undefined, 4)}\n`)

type FakePackageOptions = {
    name?: string
    version?: string
    bin?: string
    includeBin?: boolean
    exports?: boolean
}

const installFakePackage = async (
    anchor: string,
    packageName: string,
    options: FakePackageOptions = {}
): Promise<string> => {
    const packageRoot = join(anchor, "node_modules", ...packageName.split("/"))
    await mkdir(packageRoot, { recursive: true })
    const bin = options.bin
    const manifest = {
        name: options.name ?? packageName,
        version: options.version ?? "1.0.0",
        type: "module",
        ...(options.exports
            ? {
                  exports: {
                      ".": { import: "./index.js", require: "./require.cjs" },
                      "./feature": "./feature.js"
                  }
              }
            : { main: "./index.js" }),
        ...(bin === undefined ? {} : { bin: { [bin]: `./bin/${bin}` } })
    }
    await writeJson(join(packageRoot, "package.json"), manifest)
    await writeFile(join(packageRoot, "index.js"), 'export const selected = "root"\n')
    await writeFile(join(packageRoot, "require.cjs"), 'exports.selected = "require"\n')
    await writeFile(join(packageRoot, "feature.js"), 'export const selected = "feature"\n')
    if (bin !== undefined && options.includeBin !== false) {
        await mkdir(join(packageRoot, "bin"), { recursive: true })
        await writeFile(join(packageRoot, "bin", bin), "#!/usr/bin/env node\n")
    }
    return packageRoot
}

const declareTool = async (
    directory: string,
    packageName: string,
    field = "devDependencies",
    workspaces?: string[]
): Promise<void> => {
    await writeJson(join(directory, "package.json"), {
        private: true,
        ...(workspaces === undefined ? {} : { workspaces }),
        [field]: { [packageName]: "*" }
    })
}

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("Toolchain", () => {
    context("with a project declaration", () => {
        it.each(["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"])(
            "selects a tool declared in %s",
            async (field) => {
                const directory = await createDirectory()
                await declareTool(directory, "vite", field)
                const packageRoot = await installFakePackage(directory, "vite", { version: "8.1.5" })

                await expect(resolveTool("vite", directory)).resolves.toMatchObject({
                    name: "vite",
                    packageName: "vite",
                    version: "8.1.5",
                    source: "project",
                    packageRoot
                })
            }
        )

        it("imports the exact selected API and subpath", async () => {
            const directory = await createDirectory()
            await declareTool(directory, "vite")
            await installFakePackage(directory, "vite", { version: "8.1.5", exports: true })
            const tool = await resolveTool("vite", directory)

            await expect(tool.import<{ selected: string }>()).resolves.toMatchObject({
                selected: "root"
            })
            await expect(tool.import<{ selected: string }>("./feature")).resolves.toMatchObject({
                selected: "feature"
            })
        })

        it("returns the package's exact executable path", async () => {
            const directory = await createDirectory()
            await declareTool(directory, "oxlint")
            const packageRoot = await installFakePackage(directory, "oxlint", {
                version: "1.75.0",
                bin: "oxlint"
            })

            await expect(resolveTool("oxlint", directory)).resolves.toMatchObject({
                executable: join(packageRoot, "bin", "oxlint")
            })
        })

        it("rejects a declared package whose expected executable is missing", async () => {
            const directory = await createDirectory()
            await declareTool(directory, "oxfmt")
            await installFakePackage(directory, "oxfmt", {
                version: "0.60.0",
                bin: "oxfmt",
                includeBin: false
            })

            await expect(resolveTool("oxfmt", directory)).rejects.toThrow("executable is missing")
        })

        it("rejects a missing declared package instead of falling back", async () => {
            const directory = await createDirectory()
            await declareTool(directory, "vite")

            await expect(resolveTool("vite", directory)).rejects.toThrow(
                /vite is declared by .*package\.json but is not installed/
            )
        })

        it("rejects a package-name mismatch", async () => {
            const directory = await createDirectory()
            await declareTool(directory, "vite")
            await installFakePackage(directory, "vite", { name: "not-vite", version: "8.1.5" })

            await expect(resolveTool("vite", directory)).rejects.toThrow("package manifest identifies as not-vite")
        })

        it("reuses a selection within one Toolchain", async () => {
            const directory = await createDirectory()
            await declareTool(directory, "vite")
            await installFakePackage(directory, "vite", { version: "8.1.5" })
            const toolchain = new Toolchain(directory)

            expect(await toolchain.resolve("vite")).toBe(await toolchain.resolve("vite"))
        })
    })

    context("with a workspace declaration", () => {
        it("uses the nearest workspace when the project does not declare the tool", async () => {
            const workspace = await createDirectory()
            const project = join(workspace, "packages", "app")
            await mkdir(project, { recursive: true })
            await declareTool(workspace, "vite", "devDependencies", ["packages/*"])
            await writeJson(join(project, "package.json"), { name: "app" })
            const packageRoot = await installFakePackage(workspace, "vite", { version: "8.1.5" })

            await expect(resolveTool("vite", project)).resolves.toMatchObject({
                source: "project",
                packageRoot
            })
        })

        it("recognizes a pnpm workspace manifest", async () => {
            const workspace = await createDirectory()
            const project = join(workspace, "packages", "app")
            await mkdir(project, { recursive: true })
            await declareTool(workspace, "vite")
            await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n")
            await writeJson(join(project, "package.json"), { name: "app" })
            const packageRoot = await installFakePackage(workspace, "vite", { version: "8.1.5" })

            await expect(resolveTool("vite", project)).resolves.toMatchObject({
                source: "project",
                packageRoot
            })
        })

        it.each(['packages: ["packages/*"]\n', 'packages: [\n  "packages/*",\n]\n'])(
            "recognizes a pnpm workspace manifest with a flow sequence",
            async (contents) => {
                const workspace = await createDirectory()
                const project = join(workspace, "packages", "app")
                await mkdir(project, { recursive: true })
                await declareTool(workspace, "vite")
                await writeFile(join(workspace, "pnpm-workspace.yaml"), contents)
                await writeJson(join(project, "package.json"), { name: "app" })
                const packageRoot = await installFakePackage(workspace, "vite", { version: "8.2.0" })

                await expect(resolveTool("vite", project)).resolves.toMatchObject({
                    version: "8.2.0",
                    source: "project",
                    packageRoot
                })
            }
        )

        it("rejects a pnpm workspace manifest whose packages field is not a string array", async () => {
            const workspace = await createDirectory()
            const project = join(workspace, "packages", "app")
            await mkdir(project, { recursive: true })
            await declareTool(workspace, "vite")
            await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages: packages/*\n")
            await writeJson(join(project, "package.json"), { name: "app" })
            await installFakePackage(workspace, "vite", { version: "8.2.0" })

            await expect(resolveTool("vite", project)).rejects.toThrow(
                /Invalid pnpm workspace manifest at .*pnpm-workspace\.yaml: packages must be an array of strings/
            )
        })

        it("rejects syntactically invalid pnpm workspace YAML", async () => {
            const workspace = await createDirectory()
            const project = join(workspace, "packages", "app")
            await mkdir(project, { recursive: true })
            await declareTool(workspace, "vite")
            await writeFile(join(workspace, "pnpm-workspace.yaml"), 'packages: ["packages/*"\n')
            await writeJson(join(project, "package.json"), { name: "app" })
            await installFakePackage(workspace, "vite", { version: "8.2.0" })

            await expect(resolveTool("vite", project)).rejects.toThrow(
                /Invalid pnpm workspace manifest at .*pnpm-workspace\.yaml/
            )
        })

        it("ignores an ancestor workspace declaration for a non-member project", async () => {
            const workspace = await createDirectory()
            const project = join(workspace, "examples", "standalone")
            await mkdir(project, { recursive: true })
            await declareTool(workspace, "vite", "devDependencies", ["packages/*"])
            await writeJson(join(project, "package.json"), { name: "standalone" })
            await installFakePackage(workspace, "vite", { version: "8.9.9" })

            await expect(resolveTool("vite", project)).resolves.toMatchObject({
                source: "webanvil",
                version: "8.1.5"
            })
        })

        it("prefers the project declaration over the workspace declaration", async () => {
            const workspace = await createDirectory()
            const project = join(workspace, "packages", "app")
            await mkdir(project, { recursive: true })
            await declareTool(workspace, "vite", "devDependencies", ["packages/*"])
            await declareTool(project, "vite")
            await installFakePackage(workspace, "vite", { version: "8.2.0" })
            const packageRoot = await installFakePackage(project, "vite", { version: "8.1.5" })

            await expect(resolveTool("vite", project)).resolves.toMatchObject({
                version: "8.1.5",
                packageRoot
            })
        })
    })

    context("without a declaration", () => {
        it("rejects an undeclared hoist and uses WebAnvil's pinned fallback", async () => {
            const directory = await createDirectory()
            await writeJson(join(directory, "package.json"), { name: "app" })
            await installFakePackage(directory, "vite", { version: "8.9.9" })

            await expect(resolveTool("vite", directory)).resolves.toMatchObject({
                packageName: "vite",
                version: "8.1.5",
                source: "webanvil"
            })
        })

        it("keeps Playwright on WebAnvil's bundled version", async () => {
            const directory = await createDirectory()
            await declareTool(directory, "@playwright/test")
            await installFakePackage(directory, "@playwright/test", {
                version: "1.62.1",
                bin: "playwright"
            })

            await expect(resolveTool("playwright", directory)).resolves.toMatchObject({
                packageName: "@playwright/test",
                source: "webanvil",
                version: "1.62.1"
            })
        })

        it.each(Object.keys(supportedTools) as ToolName[])("provides a compatible %s fallback", async (name) => {
            const directory = await createDirectory()
            await writeJson(join(directory, "package.json"), { name: "app" })
            const tool = await resolveTool(name, directory)

            expect(tool.source).toBe("webanvil")
            expect(tool.packageName).toBe(supportedTools[name].packageName)
            expect(tool.version).toBeTruthy()
            if ("bin" in supportedTools[name]) expect(tool.executable).toBeTruthy()
        })
    })

    context("with version boundaries", () => {
        const boundaries: [ToolName, string, string, string][] = [
            ["vite", "8.1.5", "8.1.4", "9.0.0"],
            ["vitest", "4.1.10", "4.1.9", "5.0.0"],
            ["rolldown", "1.2.0", "1.1.9", "2.0.0"],
            ["oxlint", "1.75.0", "1.74.9", "2.0.0"],
            ["oxfmt", "0.60.0", "0.59.9", "0.61.0"],
            ["typescript", "5.0.0", "4.9.9", "7.0.0"],
            ["typescript-native", "7.0.0-dev.20260707.2", "7.0.0-dev.20260707.1", "7.0.0"]
        ]

        it.each(boundaries)("accepts %s at its lower bound", async (name, minimum) => {
            const directory = await createDirectory()
            const definition = supportedTools[name]
            await declareTool(directory, definition.packageName)
            await installFakePackage(directory, definition.packageName, {
                version: minimum,
                ...("bin" in definition ? { bin: definition.bin } : {})
            })

            await expect(resolveTool(name, directory)).resolves.toMatchObject({ version: minimum })
        })

        it.each(boundaries)("rejects %s below its lower bound", async (name, _minimum, below) => {
            const directory = await createDirectory()
            const definition = supportedTools[name]
            await declareTool(directory, definition.packageName)
            await installFakePackage(directory, definition.packageName, {
                version: below,
                ...("bin" in definition ? { bin: definition.bin } : {})
            })

            await expect(resolveTool(name, directory)).rejects.toThrow("is incompatible with WebAnvil")
        })

        it.each(boundaries)("rejects %s at its upper bound", async (name, _minimum, _below, upper) => {
            const directory = await createDirectory()
            const definition = supportedTools[name]
            await declareTool(directory, definition.packageName)
            await installFakePackage(directory, definition.packageName, {
                version: upper,
                ...("bin" in definition ? { bin: definition.bin } : {})
            })

            await expect(resolveTool(name, directory)).rejects.toThrow("is incompatible with WebAnvil")
        })
    })

    it("rejects an incompatible command tool before loading WebAnvil config", async () => {
        const directory = await createDirectory()
        await declareTool(directory, "oxfmt")
        await installFakePackage(directory, "oxfmt", { version: "0.61.0", bin: "oxfmt" })
        await writeFile(
            join(directory, "webanvil.config.mjs"),
            'import { writeFileSync } from "node:fs"\nwriteFileSync("config-loaded.txt", "loaded")\nexport default {}\n'
        )
        process.chdir(directory)

        await expect(
            execute([formatCommand], {
                argv: ["format", "--check"],
                metadata: { name: "wa" },
                onError: "throw"
            })
        ).rejects.toThrow("incompatible with WebAnvil")
        await expect(access(join(directory, "config-loaded.txt"))).rejects.toThrow()
    })
})

describe("optional tools", () => {
    it("uses a declared svelte-check package", async () => {
        const directory = await createDirectory()
        await declareTool(directory, "svelte-check")
        const packageRoot = await installFakePackage(directory, "svelte-check", {
            version: "4.0.0",
            bin: "svelte-check"
        })

        await expect(resolveOptionalTool("svelte-check", directory)).resolves.toMatchObject({
            name: "svelte-check",
            packageRoot,
            source: "project"
        })
    })

    it("uses a workspace declaration for a member package", async () => {
        const workspace = await createDirectory()
        const project = join(workspace, "packages", "app")
        await mkdir(project, { recursive: true })
        await declareTool(workspace, "svelte-check", "devDependencies", ["packages/*"])
        await writeJson(join(project, "package.json"), { name: "app" })
        const packageRoot = await installFakePackage(workspace, "svelte-check", {
            version: "4.0.0",
            bin: "svelte-check"
        })

        await expect(resolveOptionalTool("svelte-check", project)).resolves.toMatchObject({ packageRoot })
    })

    it("ignores an undeclared hoisted svelte-check package", async () => {
        const directory = await createDirectory()
        await writeJson(join(directory, "package.json"), { name: "app" })
        await installFakePackage(directory, "svelte-check", { version: "4.0.0", bin: "svelte-check" })

        await expect(resolveOptionalTool("svelte-check", directory)).resolves.toBeUndefined()
    })

    it("rejects a declared svelte-check package that is not installed", async () => {
        const directory = await createDirectory()
        await declareTool(directory, "svelte-check")

        await expect(resolveOptionalTool("svelte-check", directory)).rejects.toThrow(
            /svelte-check is declared by .*package\.json but is not installed/
        )
    })

    it("rejects an incompatible declared svelte-check package", async () => {
        const directory = await createDirectory()
        const definition = optionalTools["svelte-check"]
        await declareTool(directory, definition.packageName)
        await installFakePackage(directory, definition.packageName, {
            version: "5.0.0",
            bin: definition.bin
        })

        await expect(resolveOptionalTool("svelte-check", directory)).rejects.toThrow("is incompatible with WebAnvil")
    })
})

describe("formatResolvedTool", () => {
    it("reports package identity, version, and source in one announcement", async () => {
        const directory = await createDirectory()
        await declareTool(directory, "vite")
        await installFakePackage(directory, "vite", { version: "8.1.5" })

        expect(formatResolvedTool(await resolveTool("vite", directory))).toBe("vite 8.1.5 (project)")
    })
})
