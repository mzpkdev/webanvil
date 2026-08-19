import type { InlineConfig } from "vite"

import { loadConfig } from "../config"
import { resolveVitePlugins } from "../plugins"

export const withProjectVitePlugins = async (config: InlineConfig): Promise<InlineConfig> => {
    const { config: webanvilConfig } = await loadConfig()

    return {
        ...config,
        plugins: [...(config.plugins ?? []), ...resolveVitePlugins(webanvilConfig.plugins ?? [])]
    }
}
