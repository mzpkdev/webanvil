import { loadConfig as loadC12Config } from "c12"
import { defu } from "defu"
import type { OxfmtConfig } from "oxfmt"
import type { OxlintConfig } from "oxlint"
import { z } from "zod"

import { isUnpluginAdapter, isWebAnvilPlugin, type WebAnvilPlugin } from "./plugins"

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

export const buildConfigSchema = z.strictObject({
    bundle: z.boolean().optional(),
    mode: z.enum(["web", "node"]).optional(),
    entry: z.string().min(1).optional(),
    entries: z.record(z.string().min(1), z.string().min(1)).optional(),
    outDir: z.string().min(1).optional(),
    declaration: z.boolean().optional(),
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

export const testConfigSchema = z.strictObject({
    environment: z.string().min(1).optional(),
    include: z.array(z.string().min(1)).min(1).optional()
})

const toolConfigSchema = z.custom<Record<string, unknown>>(
    (value) => typeof value === "object" && value !== null && !Array.isArray(value),
    "Expected a configuration object"
)

export const formatConfigSchema = toolConfigSchema
export const lintConfigSchema = toolConfigSchema

const pluginSchema = z.custom<WebAnvilPlugin>(
    isWebAnvilPlugin,
    "Expected a Vite plugin or a WebAnvil plugin created with definePlugin()"
)

export const userConfigSchema = z.strictObject({
    build: buildConfigSchema.optional(),
    format: formatConfigSchema.optional(),
    lint: lintConfigSchema.optional(),
    test: testConfigSchema.optional(),
    plugins: z.array(pluginSchema).optional()
})

export const effectiveUserConfigSchema = userConfigSchema.superRefine((config, context) => {
    const build = config.build ?? {}

    if (build.entries !== undefined && (build.mode !== "node" || build.bundle !== true)) {
        context.addIssue({
            code: "custom",
            path: ["build", "entries"],
            message: "build.entries requires bundled Node mode"
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
                    message: "Node builds require plugins created with definePlugin()"
                })
            }
        }
    }
})

export type BuildConfig = z.infer<typeof buildConfigSchema>
export type CopyMapping = z.infer<typeof copyMappingSchema>
export type FormatConfig = OxfmtConfig
export type LintConfig = OxlintConfig
export type TestConfig = z.infer<typeof testConfigSchema>
export type UserConfig = z.infer<typeof userConfigSchema>
export type UserConfigFactory = () => UserConfig | Promise<UserConfig>
export type ConfigExport = UserConfig | UserConfigFactory

export type ResolvedConfig = {
    config: UserConfig
    configFile?: string
}

type CommandArguments = Record<string, unknown>
type ConfigSection = BuildConfig | FormatConfig | LintConfig | TestConfig
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
    async (arguments_: TArguments): Promise<TResult> => {
        const { config } = await loadConfig()
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
