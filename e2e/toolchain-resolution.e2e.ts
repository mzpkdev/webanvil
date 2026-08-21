import { execFile } from "node:child_process"
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { packageManager, packageManagerCommand, npm, webanvil, type CommandOutput, type PackageManager } from "./utils"

const execFileAsync = promisify(execFile)
const repository = fileURLToPath(new URL("..", import.meta.url))
const fixtureTemplates = fileURLToPath(new URL("fixtures/toolchain", import.meta.url))
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"

type FixtureProject = {
    directory: string
    name: string
    source: "project" | "webanvil"
    versions: {
        native: string
        oxfmt: string
        oxlint: string
        rolldown: string
        vite: string
        vitest: string
    }
}

const projects = [
    {
        directory: "",
        name: "project-local",
        source: "project",
        versions: {
            native: "7.0.0-dev.20260707.2",
            oxfmt: "0.60.0",
            oxlint: "1.75.0",
            rolldown: "1.2.0",
            vite: "8.1.5",
            vitest: "4.1.10"
        }
    },
    {
        directory: "",
        name: "WebAnvil fallback",
        source: "webanvil",
        versions: {
            native: "7.0.0-dev.20260707.2",
            oxfmt: "0.60.0",
            oxlint: "1.75.0",
            rolldown: "1.2.0",
            vite: "8.1.5",
            vitest: "4.1.10"
        }
    }
] satisfies FixtureProject[]

let temporaryDirectory: string | undefined

const prepareProjects = async (): Promise<void> => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), `webanvil-toolchain-${packageManager}-`))
    const { stdout } = await execFileAsync(
        npmCommand,
        ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryDirectory],
        {
            cwd: repository,
            encoding: "utf8",
            env: {
                ...process.env,
                npm_config_cache: join(tmpdir(), "webanvil-e2e-npm-cache")
            }
        }
    )
    const packed = JSON.parse(stdout) as Array<{ filename: string }>
    const packageEntry = packed[0]
    if (packageEntry === undefined) throw new Error("npm pack did not return a package")
    const tarball = join(temporaryDirectory, packageEntry.filename)

    for (const project of projects) {
        project.directory = join(temporaryDirectory, project.source)
        await cp(join(fixtureTemplates, project.source === "project" ? "local" : "fallback"), project.directory, {
            recursive: true
        })
        const manifestPath = join(project.directory, "package.json")
        const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
            devDependencies: Record<string, string>
        }
        manifest.devDependencies.webanvil = `file:${tarball}`
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    }
}

const clean = async (): Promise<void> => {
    if (temporaryDirectory !== undefined) {
        await rm(temporaryDirectory, { force: true, recursive: true })
        temporaryDirectory = undefined
    }
}

const outputFiles = async (directory: string): Promise<string[]> => {
    const files: string[] = []
    const visit = async (current: string): Promise<void> => {
        for (const entry of await readdir(current, { withFileTypes: true })) {
            const path = join(current, entry.name)
            if (entry.isDirectory()) await visit(path)
            else files.push(path)
        }
    }
    await visit(directory)
    return files
}

const combinedOutput = async (directory: string, extension: string): Promise<string> => {
    const files = (await outputFiles(directory)).filter((file) => file.endsWith(extension))
    expect(files.length).toBeGreaterThan(0)
    return (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n")
}

const expectSelection = (
    result: CommandOutput,
    packageName: string,
    version: string,
    source: "project" | "webanvil"
): void => {
    expect(result.output).toContain(`${packageName} ${version} (${source})`)
}

describe.sequential(`toolchain resolution with ${packageManager}`, () => {
    beforeAll(async () => {
        await prepareProjects()
        for (const project of projects) await npm.install(project.directory)
    }, 300_000)

    afterAll(clean)

    it("constructs package-manager-native installs and commands without resolving their binaries", () => {
        const expectations: Record<PackageManager, { install: string[]; webanvil: string[] }> = {
            npm: {
                install: ["install", "--ignore-scripts"],
                webanvil: ["exec", "--", "wa", "build"]
            },
            pnpm: {
                install: [
                    "install",
                    "--ignore-scripts",
                    "--lockfile=false",
                    "--store-dir",
                    join(tmpdir(), "webanvil-e2e-pnpm-cache")
                ],
                webanvil: ["exec", "wa", "build"]
            },
            bun: {
                install: [
                    "install",
                    "--ignore-scripts",
                    "--no-save",
                    "--cache-dir",
                    join(tmpdir(), "webanvil-e2e-bun-cache")
                ],
                webanvil: ["run", "--silent", "wa", "build"]
            }
        }

        for (const manager of ["npm", "pnpm", "bun"] as const) {
            expect(packageManagerCommand(manager, "install").args).toEqual(expectations[manager].install)
            expect(packageManagerCommand(manager, "webanvil", ["build"]).args).toEqual(expectations[manager].webanvil)
        }
    })

    it.each(projects)(
        "uses $name Vite and applies web build behavior",
        async (project) => {
            const result = await webanvil(
                project.directory,
                "build",
                "index.html",
                "--mode",
                "web",
                "--out-dir",
                "web-dist"
            )
            const html = await readFile(join(project.directory, "web-dist", "index.html"), "utf8")
            const javascript = await combinedOutput(join(project.directory, "web-dist"), ".js")

            expectSelection(result, "vite", project.versions.vite, project.source)
            expect(result.output).toContain("Built index.html to web-dist")
            expect(html).toContain(`/${project.source === "project" ? "local" : "fallback"}-toolchain/`)
            expect(javascript).toContain(
                project.source === "project" ? "local-vite-project-plugin" : "fallback-vite-behavior"
            )
        },
        120_000
    )

    it.each(projects)(
        "uses bundled Vitest for $name and runs the fixture suite",
        async (project) => {
            const result = await webanvil(project.directory, "test")

            expectSelection(result, "vitest", project.versions.vitest, "webanvil")
            expect(result.output).toContain("Tests passed")
            expect(result.output).toMatch(/1 passed/)
        },
        120_000
    )

    it.each(projects)(
        "uses $name Rolldown and generates TypeScript declarations",
        async (project) => {
            const result = await webanvil(project.directory, "build")
            const javascript = await combinedOutput(join(project.directory, "node-dist"), ".js")
            const declarations = await combinedOutput(join(project.directory, "node-dist"), ".d.ts")

            expectSelection(result, "rolldown", project.versions.rolldown, project.source)
            expect(result.output).toContain("Built src/node.ts to node-dist")
            if (project.source === "project") {
                expect(javascript).toContain("local-rolldown-project-plugin")
                expect(javascript).toContain("local-alias-value")
                expect(declarations).not.toContain("@/")
                expect(declarations).toContain("FixtureValue")
            } else {
                expect(javascript).toContain("fallback-rolldown-behavior")
                expect(declarations).toContain("fallbackNodeValue")
            }
        },
        120_000
    )

    it.each(projects)(
        "uses $name Oxlint and reports a completed lint",
        async (project) => {
            const result = await webanvil(project.directory, "lint", "src/node.ts")

            expectSelection(result, "oxlint", project.versions.oxlint, project.source)
            expect(result.output).toContain("Lint passed")
            expect(await readdir(join(project.directory, ".webanvil"))).not.toEqual(
                expect.arrayContaining([expect.stringMatching(/^oxlint-/)])
            )
        },
        120_000
    )

    it.each(projects)(
        "uses $name Oxfmt and formats a real source file",
        async (project) => {
            const target = join(project.directory, "format-target.ts")
            await writeFile(target, 'export const formatted={message:"toolchain"}\n')

            try {
                const result = await webanvil(project.directory, "format", "format-target.ts")
                const formatted = await readFile(target, "utf8")

                expectSelection(result, "oxfmt", project.versions.oxfmt, project.source)
                expect(result.output).toContain("Formatted")
                expect(formatted).toContain("message: 'toolchain'")
                expect(formatted).not.toContain("formatted={")
            } finally {
                await rm(target, { force: true })
            }
        },
        120_000
    )

    it.each(projects)(
        "uses $name TypeScript Native Preview and typechecks sources",
        async (project) => {
            const result = await webanvil(project.directory, "typecheck")

            expectSelection(result, "@typescript/native-preview", project.versions.native, project.source)
            expect(result.output).toContain("Type check passed")
        },
        120_000
    )
})
