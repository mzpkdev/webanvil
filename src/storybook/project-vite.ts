import { resolve } from "node:path"

import type { InlineConfig } from "vite"

import { loadConfig } from "../config"
import { hasToolConfig } from "../config-files"
import { resolveVitePlugins } from "../plugins"

export const withProjectVitePlugins = async (
    config: InlineConfig,
    storybookConfigDirectory = ".storybook"
): Promise<InlineConfig> => {
    const { config: webanvilConfig } = await loadConfig()
    const plugins = [
        ...resolveVitePlugins(webanvilConfig.plugins ?? []),
        ...((await hasToolConfig("vite", resolve(storybookConfigDirectory, "..")))
            ? []
            : (webanvilConfig.vite?.plugins ?? []))
    ]

    return {
        ...config,
        plugins: [...plugins, ...(config.plugins ?? [])]
    }
}
