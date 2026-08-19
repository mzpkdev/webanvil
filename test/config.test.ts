import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, describe as context, expect, expectTypeOf, it, vi } from "vitest"

import {
    assertSyntaxTarget,
    defineConfig,
    effectiveUserConfigSchema,
    loadConfig,
    resolveEffectiveBuildConfig,
    syntaxTargetSchema,
    userConfigSchema,
    withConfig
} from "../src/config"
import {
    defineConfig as definePublicConfig,
    type BuildConfig,
    type ConfigExport,
    type CopyMapping,
    type FormatConfig,
    type LintConfig,
    type ResolvedConfig,
    type RolldownConfig,
    type SyntaxTarget,
    type TestConfig,
    type UserConfig,
    type UserConfigFactory,
    type ViteConfig
} from "../src/index"
import { platform, target } from "../src/options"

const directories: string[] = []
const initialDirectory = process.cwd()

const createDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "webanvil-config-"))
    directories.push(directory)
    return directory
}

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("defineConfig", () => {
    context("with an object config", () => {
        it("returns the config unchanged", () => {
            const config = defineConfig({ build: { outDir: "output" } })

            expect(config).toEqual({ build: { outDir: "output" } })
        })
    })

    context("with a config factory", () => {
        it("returns the factory unchanged", () => {
            const config = defineConfig(() => ({ build: { outDir: "output" } }))

            expect(config()).toEqual({ build: { outDir: "output" } })
        })
    })
})

describe("public configuration API", () => {
    it("exports concrete config types and rejects unknown WebAnvil fields", () => {
        type IsAny<T> = 0 extends 1 & T ? true : false

        expectTypeOf<IsAny<BuildConfig>>().toEqualTypeOf<false>()
        expectTypeOf<IsAny<ConfigExport>>().toEqualTypeOf<false>()
        expectTypeOf<IsAny<CopyMapping>>().toEqualTypeOf<false>()
        expectTypeOf<IsAny<FormatConfig>>().toEqualTypeOf<false>()
        expectTypeOf<IsAny<LintConfig>>().toEqualTypeOf<false>()
        expectTypeOf<IsAny<ResolvedConfig>>().toEqualTypeOf<false>()
        expectTypeOf<IsAny<RolldownConfig>>().toEqualTypeOf<false>()
        expectTypeOf<IsAny<SyntaxTarget>>().toEqualTypeOf<false>()
        expectTypeOf<IsAny<TestConfig>>().toEqualTypeOf<false>()
        expectTypeOf<IsAny<UserConfig>>().toEqualTypeOf<false>()
        expectTypeOf<IsAny<UserConfigFactory>>().toEqualTypeOf<false>()
        expectTypeOf<IsAny<ViteConfig>>().toEqualTypeOf<false>()

        const objectConfig = definePublicConfig({ build: { mode: "node", outDir: "output" } })
        const factoryConfig = definePublicConfig(() => ({ test: { environment: "node" } }))

        expectTypeOf(objectConfig).toEqualTypeOf<UserConfig>()
        expectTypeOf(factoryConfig).toEqualTypeOf<UserConfigFactory>()
        expect(objectConfig.build?.outDir).toBe("output")
        expect(factoryConfig()).toEqual({ test: { environment: "node" } })

        const assertInvalidConfigTypes = (): void => {
            // @ts-expect-error The public root rejects fields WebAnvil does not own.
            definePublicConfig({ unknownField: true })
            // @ts-expect-error The public build block rejects fields WebAnvil does not own.
            definePublicConfig({ build: { unknownField: true } })
        }
        void assertInvalidConfigTypes
    })
})

describe("loadConfig", () => {
    context("with bundled build configuration", () => {
        it("loads configured entry mappings", async () => {
            const directory = await createDirectory()
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default { build: { bundle: true, entries: { ".": "src/index.ts" } } }'
            )

            await expect(loadConfig(directory)).resolves.toMatchObject({
                config: {
                    build: {
                        bundle: true,
                        entries: { ".": "src/index.ts" },
                        entry: "src/index.ts",
                        mode: "node",
                        outDir: "dist"
                    }
                }
            })
        })

        it("does not apply effective-mode restrictions while loading raw config", async () => {
            const directory = await createDirectory()
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default { build: { mode: "web", bundle: true, entries: { ".": "src/index.ts" }, platform: "browser" }, plugins: [{ name: "vite-only" }] }'
            )

            await expect(loadConfig(directory)).resolves.toMatchObject({
                config: {
                    build: {
                        mode: "web",
                        bundle: true,
                        entries: { ".": "src/index.ts" },
                        platform: "browser"
                    },
                    plugins: [{ name: "vite-only" }]
                }
            })
        })
    })

    context("with an object config", () => {
        it("loads the config", async () => {
            const directory = await createDirectory()
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default { build: { outDir: "output", declaration: true, copy: [{ from: "assets/**", to: "assets" }], sourcemap: true, minify: false, formats: ["esm", "cjs"], target: "node20" }, format: { tabWidth: 4 }, lint: { rules: { "no-console": "deny" } }, test: { environment: "jsdom", include: ["test/**/*.test.ts"] } }'
            )

            await expect(loadConfig(directory)).resolves.toMatchObject({
                config: {
                    build: {
                        mode: "node",
                        entry: "src/index.ts",
                        outDir: "output",
                        declaration: true,
                        copy: [{ from: "assets/**", to: "assets" }],
                        sourcemap: true,
                        minify: false,
                        formats: ["esm", "cjs"],
                        target: "node20"
                    },
                    format: { tabWidth: 4 },
                    lint: { rules: { "no-console": "deny" } },
                    test: { environment: "jsdom", include: ["test/**/*.test.ts"] }
                },
                configFile: join(directory, "webanvil.config.ts")
            })
        })
    })

    context("with plugins", () => {
        it("preserves them while merging built-in defaults", async () => {
            const directory = await createDirectory()
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default { build: { outDir: "output" }, plugins: [{ name: "example" }] }'
            )

            await expect(loadConfig(directory)).resolves.toMatchObject({
                config: {
                    build: { mode: "node", entry: "src/index.ts", outDir: "output" },
                    plugins: [{ name: "example" }]
                }
            })
        })
    })

    context("with native tool configuration", () => {
        it("loads compatible fields without WebAnvil-owned field validation", async () => {
            const directory = await createDirectory()
            await writeFile(
                join(directory, "webanvil.config.ts"),
                `export default {
                    vite: { base: "/app/", compatibleFutureField: { enabled: true } },
                    test: { globals: true, setupFiles: ["test/setup.ts"], env: { FEATURE: "enabled" }, compatibleFutureField: true },
                    rolldown: {
                        input: { resolve: { alias: { "@": "./src" } }, compatibleFutureField: true },
                        output: { esm: { entryFileNames: "[name].mjs", compatibleFutureField: true } }
                    },
                    format: { printWidth: 100, compatibleFutureField: true },
                    lint: { rules: { "no-debugger": "deny" }, compatibleFutureField: true }
                }`
            )

            await expect(loadConfig(directory)).resolves.toMatchObject({
                config: {
                    vite: { base: "/app/", compatibleFutureField: { enabled: true } },
                    test: {
                        globals: true,
                        setupFiles: ["test/setup.ts"],
                        env: { FEATURE: "enabled" },
                        compatibleFutureField: true
                    },
                    rolldown: {
                        input: {
                            resolve: { alias: { "@": "./src" } },
                            compatibleFutureField: true
                        },
                        output: {
                            esm: { entryFileNames: "[name].mjs", compatibleFutureField: true }
                        }
                    },
                    format: { printWidth: 100, compatibleFutureField: true },
                    lint: { rules: { "no-debugger": "deny" }, compatibleFutureField: true }
                }
            })
        })

        it.each(["vite", "test", "rolldown", "format", "lint"])("rejects a non-object %s block", async (key) => {
            const directory = await createDirectory()
            await writeFile(join(directory, "webanvil.config.ts"), `export default { ${key}: [] }`)

            await expect(loadConfig(directory)).rejects.toThrow("Expected a configuration object")
        })
    })

    context("with a config factory", () => {
        it("resolves the returned config", async () => {
            const directory = await createDirectory()
            await writeFile(
                join(directory, "webanvil.config.ts"),
                'export default () => ({ build: { outDir: "output" } })'
            )

            await expect(loadConfig(directory)).resolves.toMatchObject({
                config: { build: { outDir: "output" } }
            })
        })
    })

    context("with invalid config", () => {
        it("rejects unknown keys", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "webanvil.config.ts"), "export default { unexpected: true }")

            await expect(loadConfig(directory)).rejects.toThrow()
        })

        it("rejects empty syntax targets", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "webanvil.config.ts"), 'export default { build: { target: "" } }')

            await expect(loadConfig(directory)).rejects.toThrow()
        })

        it.each(["browser", "neutral"] as const)("reports the platform migration for a %s target", async (legacy) => {
            const directory = await createDirectory()
            await writeFile(join(directory, "webanvil.config.ts"), `export default { build: { target: "${legacy}" } }`)

            const error = await loadConfig(directory).catch((caught: unknown) => caught)
            expect(error).toMatchObject({
                issues: [
                    expect.objectContaining({
                        message: `build.target no longer selects a platform; use build.platform: "${legacy}" instead`
                    })
                ]
            })
        })

        it("rejects invalid build modes", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "webanvil.config.ts"), 'export default { build: { mode: "library" } }')

            await expect(loadConfig(directory)).rejects.toThrow()
        })

        it("accepts Storybook as a build mode", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "webanvil.config.ts"), 'export default { build: { mode: "storybook" } }')

            await expect(loadConfig(directory)).resolves.toMatchObject({ config: { build: { mode: "storybook" } } })
        })

        it("leaves native test-field validation to Vitest", async () => {
            const directory = await createDirectory()
            await writeFile(join(directory, "webanvil.config.ts"), 'export default { test: { environment: "" } }')

            await expect(loadConfig(directory)).resolves.toMatchObject({
                config: { test: { environment: "" } }
            })
        })
    })
})

describe("syntaxTargetSchema", () => {
    it("accepts scalar and array syntax targets", () => {
        expect(syntaxTargetSchema.parse("node18")).toBe("node18")
        expect(syntaxTargetSchema.parse(["es2022", "chrome100"])).toEqual(["es2022", "chrome100"])
    })

    it("rejects empty scalar and array syntax targets", () => {
        expect(syntaxTargetSchema.safeParse("").success).toBe(false)
        expect(syntaxTargetSchema.safeParse([]).success).toBe(false)
        expect(syntaxTargetSchema.safeParse(["es2022", ""]).success).toBe(false)
    })

    it.each(["browser", "neutral"] as const)("reports the platform migration for %s", (legacy) => {
        const result = syntaxTargetSchema.safeParse(legacy)
        expect(result.success).toBe(false)
        if (result.success) throw new Error("expected validation failure")
        expect(result.error.issues).toEqual([
            expect.objectContaining({
                message: `build.target no longer selects a platform; use build.platform: "${legacy}" instead`
            })
        ])
        expect(() => assertSyntaxTarget(["es2022", legacy])).toThrow(
            `build.target no longer selects a platform; use build.platform: "${legacy}" instead`
        )
    })
})

describe("native configuration schemas", () => {
    it("preserves native functions and plugin objects by identity", () => {
        const vitePlugin = { name: "vite-native", transform: vi.fn() }
        const rolldownPlugin = { name: "rolldown-native", transform: vi.fn() }
        const rolldownPlugins = [rolldownPlugin]
        const entryFileNames = vi.fn(() => "index.mjs")
        const sequence = { hooks: "list" as const }
        const config = {
            vite: { plugins: [vitePlugin] },
            test: { sequence },
            rolldown: {
                input: { plugins: rolldownPlugins },
                output: { esm: { entryFileNames } }
            }
        }

        const parsed = userConfigSchema.parse(config)

        expect(parsed.vite?.plugins?.[0]).toBe(vitePlugin)
        expect(parsed.test?.sequence).toBe(sequence)
        expect(parsed.rolldown?.input?.plugins).toBe(rolldownPlugins)
        expect(parsed.rolldown?.output?.esm?.entryFileNames).toBe(entryFileNames)
    })
})

describe("declaration configuration", () => {
    it("accepts the native plugin options object unchanged", () => {
        const declaration = {
            generator: "tsc" as const,
            compilerOptions: { stripInternal: true },
            newContext: false,
            sourcemap: true
        }

        expect(userConfigSchema.parse({ build: { declaration } }).build?.declaration).toBe(declaration)
    })

    it("lets an explicit CLI boolean replace the configured object", () => {
        const declaration = { generator: "oxc" as const, oxc: { stripInternal: true } }

        expect(resolveEffectiveBuildConfig({ build: { declaration } }, { declaration: false }, false).declaration).toBe(
            false
        )
    })
})

describe("build target options", () => {
    it("parses one syntax target or a trimmed comma-separated list", () => {
        expect(target.schema.parse("es2022")).toBe("es2022")
        expect(target.schema.parse("es2022, chrome100")).toEqual(["es2022", "chrome100"])
    })

    it("rejects empty comma-separated target segments and legacy platform targets", () => {
        expect(target.schema.safeParse("es2022,").success).toBe(false)
        expect(target.schema.safeParse(" , ").success).toBe(false)
        const result = target.schema.safeParse("es2022,browser")
        expect(result.success).toBe(false)
        if (result.success) throw new Error("expected validation failure")
        expect(result.error.issues).toEqual([
            expect.objectContaining({
                message: 'build.target no longer selects a platform; use build.platform: "browser" instead'
            })
        ])
    })

    it("accepts only Node, browser, and neutral platforms", () => {
        expect(platform.schema.parse("node")).toBe("node")
        expect(platform.schema.parse("browser")).toBe("browser")
        expect(platform.schema.parse("neutral")).toBe("neutral")
        expect(platform.schema.safeParse("worker").success).toBe(false)
    })
})

describe("effectiveUserConfigSchema", () => {
    context("with entries", () => {
        it("accepts entries in bundled Node mode", () => {
            expect(
                effectiveUserConfigSchema.safeParse({
                    build: { mode: "node", bundle: true, entries: { ".": "src/index.ts" } }
                }).success
            ).toBe(true)
        })

        it.each([{ mode: "node" as const, bundle: false }, { mode: "node" as const }])(
            "accepts entries in unbundled Node mode",
            (build) => {
                expect(
                    effectiveUserConfigSchema.safeParse({
                        build: { ...build, entries: { ".": "src/index.ts" } }
                    }).success
                ).toBe(true)
            }
        )

        it("rejects entries in web mode", () => {
            const result = effectiveUserConfigSchema.safeParse({
                build: { mode: "web", bundle: true, entries: { ".": "src/index.ts" } }
            })

            expect(result.success).toBe(false)
            if (result.success) throw new Error("expected validation failure")
            expect(result.error.issues).toEqual([
                expect.objectContaining({
                    path: ["build", "entries"],
                    message: "build.entries is only available in Node mode"
                })
            ])
        })
    })

    context("with plugins", () => {
        it("reports one indexed issue per raw Node plugin without invoking adapters", () => {
            const rolldown = vi.fn(() => [])
            const vite = vi.fn(() => ({ name: "adapted" }))
            const result = effectiveUserConfigSchema.safeParse({
                build: { mode: "node" },
                plugins: [{ name: "vite-only" }, { rolldown, vite }, { name: "another-vite-plugin" }]
            })

            expect(result.success).toBe(false)
            if (result.success) throw new Error("expected validation failure")
            expect(result.error.issues).toEqual([
                expect.objectContaining({
                    path: ["plugins", 0],
                    message: "Node builds require plugins created with definePlugin()"
                }),
                expect.objectContaining({
                    path: ["plugins", 2],
                    message: "Node builds require plugins created with definePlugin()"
                })
            ])
            expect(rolldown).not.toHaveBeenCalled()
            expect(vite).not.toHaveBeenCalled()
        })

        it("accepts a raw Vite plugin in effective web mode", () => {
            expect(
                effectiveUserConfigSchema.safeParse({
                    build: { mode: "web" },
                    plugins: [{ name: "vite-only" }]
                }).success
            ).toBe(true)
        })
    })

    it("rejects platform in effective web mode", () => {
        const result = effectiveUserConfigSchema.safeParse({
            build: { mode: "web", platform: "browser" }
        })

        expect(result.success).toBe(false)
        if (result.success) throw new Error("expected validation failure")
        expect(result.error.issues).toEqual([
            expect.objectContaining({
                path: ["build", "platform"],
                message: "Web builds do not accept build.platform"
            })
        ])
    })
})

describe("resolveEffectiveBuildConfig", () => {
    it("applies a CLI mode before validating plugins", () => {
        expect(() =>
            resolveEffectiveBuildConfig(
                { build: { mode: "web" }, plugins: [{ name: "vite-only" }] },
                { mode: "node" },
                false
            )
        ).toThrow("Node builds require plugins created with definePlugin()")

        expect(
            resolveEffectiveBuildConfig(
                { build: { mode: "node" }, plugins: [{ name: "vite-only" }] },
                { mode: "web" },
                false
            )
        ).toMatchObject({ mode: "web" })
    })

    it("removes configured entries for an explicit positional entry before validation", () => {
        const effective = resolveEffectiveBuildConfig(
            {
                build: {
                    mode: "web",
                    bundle: true,
                    entry: "configured.html",
                    entries: { "./feature": "src/feature.ts" }
                }
            },
            { entry: "cli.html" },
            true
        )

        expect(effective).toMatchObject({ mode: "web", bundle: true, entry: "cli.html" })
        expect(effective).not.toHaveProperty("entries")
    })

    it("retains configured entries when the entry is not explicit", () => {
        expect(() =>
            resolveEffectiveBuildConfig(
                {
                    build: {
                        mode: "web",
                        bundle: true,
                        entry: "configured.html",
                        entries: { "./feature": "src/feature.ts" }
                    }
                },
                {},
                false
            )
        ).toThrow("build.entries is only available in Node mode")
    })
})

describe("withConfig", () => {
    it("uses built-in defaults when no config file exists", async () => {
        const directory = await createDirectory()
        process.chdir(directory)

        const run = withConfig(
            (config) => config.build,
            async (arguments_: { entry?: string; "out-dir"?: string }) => arguments_
        )

        await expect(run({})).resolves.toEqual({
            mode: "node",
            entry: "src/index.ts",
            "out-dir": "dist"
        })
    })

    it("uses build config for missing command inputs and gives CLI inputs precedence", async () => {
        const directory = await createDirectory()
        await writeFile(
            join(directory, "webanvil.config.ts"),
            'export default { build: { mode: "web", entry: "src/config.ts", outDir: "configured-dist", sourcemap: true, minify: false, formats: ["esm"], target: "es2022" } }'
        )
        process.chdir(directory)

        const run = withConfig(
            (config) => config.build,
            async (arguments_: { entry?: string; "out-dir"?: string }) => arguments_
        )

        await expect(run({ entry: "src/cli.ts" })).resolves.toEqual({
            mode: "web",
            entry: "src/cli.ts",
            "out-dir": "configured-dist",
            sourcemap: true,
            minify: false,
            formats: ["esm"],
            target: "es2022"
        })
    })

    it("passes untouched CLI arguments as the fourth callback parameter", async () => {
        const directory = await createDirectory()
        process.chdir(directory)
        const explicit = { entry: "src/cli.ts", "out-dir": undefined }

        const run = withConfig(
            (config) => config.build,
            async (_arguments, _selectedConfig, _resolvedConfig, explicitArguments) => explicitArguments
        )

        await expect(run(explicit)).resolves.toBe(explicit)
    })
})
