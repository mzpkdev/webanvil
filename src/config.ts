import { loadConfig as loadC12Config } from "c12"
import { defu } from "defu"
import { z } from "zod"

export const buildConfigSchema = z.strictObject({
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

export const userConfigSchema = z.strictObject({
    build: buildConfigSchema.optional(),
    plugins: z.array(z.unknown()).optional()
})

export type BuildConfig = z.infer<typeof buildConfigSchema>
export type UserConfig = z.infer<typeof userConfigSchema>
export type UserConfigFactory = () => UserConfig | Promise<UserConfig>
export type ConfigExport = UserConfig | UserConfigFactory

export type ResolvedConfig = {
    config: UserConfig
    configFile?: string
}

type CommandArguments = Record<string, unknown>
type ResolvedArguments<TArguments extends CommandArguments> = {
    [TKey in keyof TArguments]-?: Exclude<TArguments[TKey], undefined>
}

export const defaultConfig = {
    build: {
        entry: "src/index.ts",
        outDir: "dist"
    }
} satisfies UserConfig

const toCommandArguments = (config: BuildConfig): CommandArguments =>
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
    <TArguments extends CommandArguments, TResult>(
        run: (arguments_: ResolvedArguments<TArguments>) => TResult | Promise<TResult>
    ) =>
    async (arguments_: TArguments): Promise<TResult> => {
        const { config } = await loadConfig()

        return run({
            ...toCommandArguments(config.build ?? {}),
            ...defined(arguments_)
        } as ResolvedArguments<TArguments>)
    }
