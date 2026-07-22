import { loadConfig as loadC12Config } from "c12"
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

export const defineConfig = <T extends ConfigExport>(config: T): T => config

export const loadConfig = async (cwd = process.cwd()): Promise<ResolvedConfig> => {
    const { config, configFile } = await loadC12Config<UserConfig>({
        name: "webanvil",
        cwd,
        configFile: "webanvil.config",
        packageJson: false,
        rcFile: false
    })

    return { config: userConfigSchema.parse(config), configFile }
}
