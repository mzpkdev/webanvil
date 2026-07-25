import { execFile } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve, sep } from "node:path"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)
const projectDirectory = fileURLToPath(new URL("..", import.meta.url))
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"
const commandEnvironment = (cacheDirectory: string): NodeJS.ProcessEnv => ({
    ...process.env,
    npm_config_audit: "false",
    npm_config_cache: cacheDirectory,
    npm_config_fund: "false",
    npm_config_update_notifier: "false"
})

type PackFile = {
    path: string
}

type PackResult = {
    filename: string
    files: PackFile[]
}

type CommandFailure = Error & {
    code?: number | string
    stderr?: string
    stdout?: string
}

const run = async (
    command: string,
    arguments_: string[],
    cwd: string,
    cacheDirectory: string
): Promise<{ stderr: string; stdout: string }> => {
    try {
        const { stderr, stdout } = await execFileAsync(command, arguments_, {
            cwd,
            encoding: "utf8",
            env: commandEnvironment(cacheDirectory),
            maxBuffer: 10 * 1024 * 1024
        })
        return { stderr, stdout }
    } catch (error) {
        const failure = error as CommandFailure
        failure.message = `${failure.message}\n${failure.stdout ?? ""}\n${failure.stderr ?? ""}`
        throw failure
    }
}

const runNpm = (arguments_: string[], cwd: string, cacheDirectory: string) =>
    run(npmCommand, arguments_, cwd, cacheDirectory)

const parsePackResult = (stdout: string): PackResult => {
    const result = JSON.parse(stdout) as PackResult[]
    expect(result).toHaveLength(1)
    return result[0]!
}

const runtimeChunks = async (entries: string[]): Promise<string[]> => {
    const chunks = new Set<string>()
    const visited = new Set<string>()
    const pending = [...entries]
    const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g

    while (pending.length > 0) {
        const file = pending.pop()!
        if (visited.has(file)) continue
        visited.add(file)

        const source = await readFile(join(projectDirectory, file), "utf8")
        for (const match of source.matchAll(importPattern)) {
            const specifier = match[1]!
            if (!specifier.startsWith(".")) continue

            const target = relative(projectDirectory, resolve(dirname(join(projectDirectory, file)), specifier))
                .split(sep)
                .join("/")

            if (!target.startsWith("dist/_chunks/") || !target.endsWith(".mjs")) continue
            if (!chunks.has(target)) {
                chunks.add(target)
                pending.push(target)
            }
        }
    }

    return [...chunks].sort()
}

const validConsumerSource = `import { defineConfig, definePlugin } from "webanvil"

const declarationLogger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
}

const volarPlugin = {
    extensionPatterns: [/\\\\.vue$/],
    tsFileExtensionInfos: [{ extension: ".vue", isMixedContent: true, scriptKind: 7 }],
    toTsFilename: (id: string) => \`\${id}.ts\`
}

const replace = {
    rolldown: (options: { from: string; to: string }) => ({
        name: "replace",
        transform: (code: string) => code.replace(options.from, options.to)
    }),
    vite: (options: { from: string; to: string }) => ({
        name: "replace",
        transform: (code: string) => code.replace(options.from, options.to)
    })
}

export default defineConfig({
    build: {
        mode: "node",
        bundle: true,
        entries: { ".": "src/index.ts" },
        declaration: {
            generator: "tsc",
            logger: declarationLogger,
            oxc: { stripInternal: true },
            volarPlugins: [volarPlugin]
        }
    },
    format: { tabWidth: 4 },
    lint: { rules: { "no-debugger": "deny" } },
    rolldown: { output: { esm: { entryFileNames: "[name].mjs" } } },
    test: { environment: "node" },
    vite: { base: "/" },
    plugins: [definePlugin(replace, { from: "development", to: "production" })]
})
`

const invalidRootConsumerSource = `import { defineConfig } from "webanvil"

export default defineConfig({ unknownField: true })
`

const invalidNestedConsumerSource = `import { defineConfig } from "webanvil"

export default defineConfig({ build: { declaration: { unknownDeclarationField: true } } })
`

const invalidPluginConsumerSource = `import { definePlugin } from "webanvil"

const replace = {
    rolldown: (options: { from: string; to: string }) => ({
        name: "replace",
        transform: (code: string) => code.replace(options.from, options.to)
    }),
    vite: (options: { from: string; to: string }) => ({
        name: "replace",
        transform: (code: string) => code.replace(options.from, options.to)
    })
}

definePlugin(replace, { from: "development" })
`

const createConsumer = async (
    rootDirectory: string,
    name: string,
    moduleResolution: "Bundler" | "NodeNext",
    tarball: string,
    cacheDirectory: string
): Promise<string> => {
    const directory = join(rootDirectory, name)
    await mkdir(directory)
    await Promise.all([
        writeFile(
            join(directory, "package.json"),
            `${JSON.stringify({ name, private: true, type: "module" }, null, 4)}\n`
        ),
        writeFile(join(directory, "valid.ts"), validConsumerSource),
        writeFile(join(directory, "invalid-root.ts"), invalidRootConsumerSource),
        writeFile(join(directory, "invalid-nested.ts"), invalidNestedConsumerSource),
        writeFile(join(directory, "invalid-plugin.ts"), invalidPluginConsumerSource)
    ])

    await runNpm(
        [
            "install",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "--package-lock=false",
            "--save-dev",
            "typescript@6.0.3",
            tarball
        ],
        directory,
        cacheDirectory
    )

    const compilerOptions = {
        target: "ES2022",
        module: moduleResolution === "NodeNext" ? "NodeNext" : "ESNext",
        moduleResolution,
        noEmit: true,
        strict: true,
        skipLibCheck: false,
        types: ["node"]
    }
    const fixtureFiles = ["invalid-root.ts", "invalid-nested.ts", "invalid-plugin.ts"] as const
    await Promise.all([
        writeFile(
            join(directory, "tsconfig.valid.json"),
            `${JSON.stringify({ compilerOptions, files: ["valid.ts"] }, null, 4)}\n`
        ),
        ...fixtureFiles.map((file) =>
            writeFile(
                join(directory, `tsconfig.${file.replace(".ts", "")}.json`),
                `${JSON.stringify({ compilerOptions, files: [file] }, null, 4)}\n`
            )
        )
    ])

    return directory
}

describe.sequential("published package", () => {
    let cacheDirectory: string
    let packFiles: string[]
    let tarball: string
    let temporaryDirectory: string

    beforeAll(async () => {
        temporaryDirectory = await mkdtemp(join(tmpdir(), "webanvil-package-consumer-"))
        cacheDirectory = join(temporaryDirectory, "npm-cache")

        await runNpm(["run", "build"], projectDirectory, cacheDirectory)

        const dryRun = parsePackResult(
            (await runNpm(["pack", "--dry-run", "--json", "--ignore-scripts"], projectDirectory, cacheDirectory)).stdout
        )
        packFiles = dryRun.files.map((file) => file.path).sort()

        const packed = parsePackResult(
            (
                await runNpm(
                    ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryDirectory],
                    projectDirectory,
                    cacheDirectory
                )
            ).stdout
        )
        tarball = join(temporaryDirectory, packed.filename)
    }, 120_000)

    afterAll(async () => {
        if (temporaryDirectory !== undefined) {
            await rm(temporaryDirectory, { force: true, recursive: true })
        }
    })

    it("contains the typed runtime package and excludes development sources", async () => {
        const chunks = await runtimeChunks(["dist/index.mjs", "dist/cli.mjs"])
        const requiredFiles = [
            "bin/webanvil",
            "bin/webanvil.cmd",
            "dist/cli.mjs",
            "dist/index.d.mts",
            "dist/index.mjs",
            ...chunks
        ]

        expect(chunks.length).toBeGreaterThan(0)
        expect(packFiles).toEqual(expect.arrayContaining(requiredFiles))
        expect(
            packFiles.filter(
                (file) =>
                    file === ".preemdeck" ||
                    file.startsWith(".preemdeck/") ||
                    file === "src" ||
                    file.startsWith("src/") ||
                    file === "test" ||
                    file.startsWith("test/") ||
                    file === "tests" ||
                    file.startsWith("tests/")
            )
        ).toEqual([])
    })

    it("does not expose declaration-plugin or optional bundler peer types", async () => {
        const declarations = (
            await Promise.all(
                ["dist/index.d.mts", "dist/cli.d.mts"].map((file) => readFile(join(projectDirectory, file)))
            )
        ).join("\n")

        for (const packageName of [
            "rolldown-plugin-dts",
            "unplugin",
            "@volar/",
            "@farmfe/",
            "@rspack/",
            "esbuild",
            "rollup",
            "unloader",
            "webpack"
        ]) {
            expect(declarations).not.toContain(packageName)
        }
    })

    it.each([
        ["Bundler", "bundler-consumer"],
        ["NodeNext", "nodenext-consumer"]
    ] as const)(
        "typechecks valid config and rejects invalid config and plugin fields with %s resolution",
        async (resolution, name) => {
            const directory = await createConsumer(temporaryDirectory, name, resolution, tarball, cacheDirectory)
            const typescript = join(directory, "node_modules", "typescript", "bin", "tsc")
            const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
                devDependencies?: Record<string, string>
            }

            expect(packageJson.devDependencies).not.toHaveProperty("@types/node")
            const valid = await run(
                process.execPath,
                [typescript, "--project", "tsconfig.valid.json"],
                directory,
                cacheDirectory
            )
            expect(`${valid.stdout}\n${valid.stderr}`).not.toContain("TS7016")

            for (const [fixture, expected] of [
                ["invalid-root", "unknownField"],
                ["invalid-nested", "unknownDeclarationField"],
                ["invalid-plugin", "to"]
            ] as const) {
                let failure: CommandFailure | undefined
                try {
                    await run(
                        process.execPath,
                        [typescript, "--project", `tsconfig.${fixture}.json`],
                        directory,
                        cacheDirectory
                    )
                } catch (error) {
                    failure = error as CommandFailure
                }

                expect(failure).toBeDefined()
                expect(failure?.code).not.toBe(0)
                expect(`${failure?.stdout ?? ""}\n${failure?.stderr ?? ""}`).toContain(expected)
            }
        },
        120_000
    )
})
