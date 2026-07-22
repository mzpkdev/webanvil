import { loadConfig as loadC12Config } from "c12"

export type BuildConfig = {
    entry?: string
    outDir?: string
    declaration?: boolean
    sourcemap?: boolean
    minify?: boolean
    formats?: Array<"esm" | "cjs">
    target?: "node20" | "browser" | "neutral"
}

export type UserConfig = {
    build?: BuildConfig
    plugins?: unknown[]
}

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

    return { config, configFile }
}
