export * from "./arguments/index"
export * from "./commands/index"
export * from "./config"
export * from "./options/index"
export * from "./plugins"

import type { ConfigExport, UserConfig, UserConfigFactory } from "./config"
import { defineConfig as defineConfigImplementation } from "./config"

export function defineConfig(config: UserConfig): UserConfig
export function defineConfig(config: UserConfigFactory): UserConfigFactory
export function defineConfig(config: ConfigExport): ConfigExport {
    return defineConfigImplementation(config)
}
