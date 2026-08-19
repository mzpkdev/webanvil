import { loadConfig as loadC12Config } from "c12"
import { defu } from "defu"
import type { OxfmtConfig } from "oxfmt"
import type { OxlintConfig } from "oxlint"
import type { InputOptions, OutputOptions } from "rolldown"
import type { UserConfig as ViteUserConfig } from "vite"
import type { TestUserConfig } from "vitest/config"
import { z } from "zod"

import { NODE_PLUGIN_ERROR } from "./plugin-validation"
import { isUnpluginAdapter, isWebAnvilPlugin, type WebAnvilPlugin } from "./plugins"
import type { DeclarationConfig } from "./core/declaration"

export const copyMappingSchema = z.strictObject({
    from: z.string().min(1),
    to: z.string().min(1)
})

export type SyntaxTarget = string | string[]

const legacyPlatformTarget = (target: SyntaxTarget): "browser" | "neutral" | undefined =>
    (typeof target === "string" ? [target] : target).find(
        (value): value is "browser" | "neutral" => value === "browser" || value === "neutral"
    )

export const assertSyntaxTarget = (target: SyntaxTarget | undefined): void => {
    if (target === undefined) return

    const legacy = legacyPlatformTarget(target)
    if (legacy !== undefined) {
        throw new Error(`build.target no longer selects a platform; use build.platform: "${legacy}" instead`)
    }
}

export const syntaxTargetSchema = z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .superRefine((target, context) => {
        const legacy = legacyPlatformTarget(target)
        if (legacy !== undefined) {
            context.addIssue({
                code: "custom",
                message: `build.target no longer selects a platform; use build.platform: "${legacy}" instead`
            })
        }
    })

const nativeConfigSchema = <T extends object>() =>
    z.custom<T>(
        (value) => typeof value === "object" && value !== null && !Array.isArray(value),
        "Expected a configuration object"
    )

export const buildConfigSchema = z.strictObject({
    bundle: z.boolean().optional(),
    mode: z.enum(["web", "node"]).optional(),
    entry: z.string().min(1).optional(),
    entries: z.record(z.string().min(1), z.string().min(1)).optional(),
    outDir: z.string().min(1).optional(),
    declaration: z.union([z.boolean(), nativeConfigSchema<DeclarationConfig>()]).optional(),
    sourcemap: z.boolean().optional(),
    minify: z.boolean().optional(),
    copy: z.array(copyMappingSchema).optional(),
    formats: z
        .array(z.enum(["esm", "cjs"]))
        .min(1)
        .optional(),
    platform: z.enum(["node", "browser", "neutral"]).optional(),
    target: syntaxTargetSchema.optional()
})

export type RolldownConfig = {
    input?: Omit<InputOptions, "cwd" | "input">
    output?: Partial<
        Record<
            "esm" | "cjs",
            Omit<OutputOptions, "cleanDir" | "dir" | "format" | "preserveModules" | "preserveModulesRoot">
        >
    >
}

export type LintConfig = Omit<OxlintConfig, "extends"> & {
    extends?: Array<OxlintConfig | string>
}

export const formatConfigSchema = nativeConfigSchema<OxfmtConfig>()
export const lintConfigSchema = nativeConfigSchema<LintConfig>()
export const rolldownConfigSchema = nativeConfigSchema<RolldownConfig>()
export const testConfigSchema = nativeConfigSchema<TestUserConfig>()
export const viteConfigSchema = nativeConfigSchema<ViteUserConfig>()

export const storybookConfigSchema = z.strictObject({
    configDir: z.string().min(1).optional(),
    framework: z.enum(["react", "svelte", "vue", "web-components"]).optional(),
    host: z.string().min(1).optional(),
    outDir: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65_535).optional(),
    test: z.boolean().optional()
})

const pluginSchema = z.custom<WebAnvilPlugin>(
    isWebAnvilPlugin,
    "Expected a Vite plugin or a WebAnvil plugin created with definePlugin()"
)

export const userConfigSchema = z.strictObject({
    build: buildConfigSchema.optional(),
    format: formatConfigSchema.optional(),
    lint: lintConfigSchema.optional(),
    rolldown: rolldownConfigSchema.optional(),
    storybook: storybookConfigSchema.optional(),
    test: testConfigSchema.optional(),
    vite: viteConfigSchema.optional(),
    plugins: z.array(pluginSchema).optional()
})

export const effectiveUserConfigSchema = userConfigSchema.superRefine((config, context) => {
    const build = config.build ?? {}

    if (build.entries !== undefined && build.mode !== "node") {
        context.addIssue({
            code: "custom",
            path: ["build", "entries"],
            message: "build.entries is only available in Node mode"
        })
    }

    if (build.mode === "web" && build.platform !== undefined) {
        context.addIssue({
            code: "custom",
            path: ["build", "platform"],
            message: "Web builds do not accept build.platform"
        })
    }

    if (build.mode === "node") {
        for (const [index, plugin] of (config.plugins ?? []).entries()) {
            if (!isUnpluginAdapter(plugin)) {
                context.addIssue({
                    code: "custom",
                    path: ["plugins", index],
                    message: NODE_PLUGIN_ERROR
                })
            }
        }
    }

    if (config.storybook !== undefined) {
        if (build.mode !== "node") {
            context.addIssue({
                code: "custom",
                path: ["storybook"],
                message: 'storybook is available for Node projects; set build.mode to "node"'
            })
        }
        if (config.storybook.framework === undefined) {
            context.addIssue({
                code: "custom",
                path: ["storybook", "framework"],
                message: "storybook.framework selects the Storybook framework adapter"
            })
        }
    }
})

export type BuildConfig = z.infer<typeof buildConfigSchema>
export type CopyMapping = z.infer<typeof copyMappingSchema>
export type FormatConfig = OxfmtConfig
export type TestConfig = TestUserConfig
export type ViteConfig = ViteUserConfig
export type StorybookConfig = z.infer<typeof storybookConfigSchema>
export type UserConfig = z.infer<typeof userConfigSchema>
export type UserConfigFactory = () => UserConfig | Promise<UserConfig>
export type ConfigExport = UserConfig | UserConfigFactory

export type ResolvedConfig = {
    config: UserConfig
    configFile?: string
}

type CommandArguments = Record<string, unknown>
type ConfigSection = BuildConfig | FormatConfig | LintConfig | StorybookConfig | TestConfig
type ResolvedArguments<TArguments extends CommandArguments> = {
    [TKey in keyof TArguments]-?: Exclude<TArguments[TKey], undefined>
}

export const defaultConfig = {
    build: {
        mode: "node",
        entry: "src/index.ts",
        outDir: "dist"
    },
    test: {
        environment: "node"
    }
} satisfies UserConfig

const toCommandArguments = (config: ConfigSection): CommandArguments =>
    Object.fromEntries(
        Object.entries(config)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value])
    )

const defined = (arguments_: CommandArguments): CommandArguments =>
    Object.fromEntries(Object.entries(arguments_).filter(([, value]) => value !== undefined))

export const defineConfig = <T extends ConfigExport>(config: T): T => config

export const loadConfig = async (cwd = process.cwd()): Promise<ResolvedConfig> => {
    const { config, configFile } = await loadC12Config<UserConfig>({
        name: "webanvil",
        cwd,
        configFile: "webanvil.config",
        packageJson: false,
        rcFile: false
    })

    return { config: userConfigSchema.parse(defu(config, defaultConfig)), configFile }
}

export const resolveEffectiveBuildConfig = (
    config: UserConfig,
    overrides: BuildConfig,
    explicitEntry: boolean
): BuildConfig => {
    const build = { ...config.build, ...defined(overrides) } as BuildConfig
    if (explicitEntry) delete build.entries

    return effectiveUserConfigSchema.parse({ ...config, build }).build ?? {}
}

export const withConfig =
    <TConfig extends ConfigSection, TArguments extends CommandArguments, TResult>(
        select: (config: UserConfig) => TConfig | undefined,
        run: (
            arguments_: ResolvedArguments<TArguments>,
            config: TConfig,
            resolvedConfig: UserConfig,
            explicitArguments: TArguments
        ) => TResult | Promise<TResult>
    ) =>
    async (arguments_: TArguments, resolvedConfig?: UserConfig): Promise<TResult> => {
        const config = resolvedConfig ?? (await loadConfig()).config
        const selectedConfig = (select(config) ?? {}) as TConfig

        return run(
            {
                ...toCommandArguments(selectedConfig),
                ...defined(arguments_)
            } as ResolvedArguments<TArguments>,
            selectedConfig,
            config,
            arguments_
        )
    }
