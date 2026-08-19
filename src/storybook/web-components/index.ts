import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import type { StorybookConfig as NativeStorybookConfig } from "@storybook/web-components-vite/node"

export type StorybookConfig = Omit<NativeStorybookConfig, "framework"> & {
    framework?: NativeStorybookConfig["framework"]
}

export const framework = dirname(fileURLToPath(import.meta.url))
