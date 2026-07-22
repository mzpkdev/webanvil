import { loadConfig as loadC12Config } from "c12"
import { defu } from "defu"
import { z } from "zod"

export const buildConfigSchema = z.strictObject({
    mode: z.enum(["web", "node"]).optional(),
    entry: z.string().min(1).optional(),
    outDir: z.string().min(1).optional(),
    declaration: z.boolean().optional(),
    sourcemap: z.boolean().optional(),
    minify: z.boolean().optional(),
    formats: z
        .array(z.enum(["esm", "cjs"]))
        .min(1)
        .optional(),
    target: z.enum(["node20", "browser", "neutral"]).optional()
})

export const testConfigSchema = z.strictObject({
    environment: z.string().min(1).optional(),
    include: z.array(z.string().min(1)).min(1).optional()
})

export const userConfigSchema = z.strictObject({
    build: buildConfigSchema.optional(),
    test: testConfigSchema.optional(),
    plugins: z.array(z.unknown()).optional()
})

export type BuildConfig = z.infer<typeof buildConfigSchema>
export type TestConfig = z.infer<typeof testConfigSchema>
export type UserConfig = z.infer<typeof userConfigSchema>
export type UserConfigFactory = () => UserConfig | Promise<UserConfig>
export type ConfigExport = UserConfig | UserConfigFactory

export type ResolvedConfig = {
    config: UserConfig
    configFile?: string
}

type CommandArguments = Record<string, unknown>
type ConfigSection = BuildConfig | TestConfig
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

export const withConfig =
    <TConfig extends ConfigSection, TArguments extends CommandArguments, TResult>(
        select: (config: UserConfig) => TConfig | undefined,
        run: (arguments_: ResolvedArguments<TArguments>, config: TConfig) => TResult | Promise<TResult>
    ) =>
    async (arguments_: TArguments): Promise<TResult> => {
        const { config } = await loadConfig()
        const selectedConfig = (select(config) ?? {}) as TConfig

        return run(
            {
                ...toCommandArguments(selectedConfig),
                ...defined(arguments_)
            } as ResolvedArguments<TArguments>,
            selectedConfig
        )
    }
