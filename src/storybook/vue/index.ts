import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

export type { StorybookConfig } from "@storybook/vue3-vite/node"

export const framework = dirname(fileURLToPath(import.meta.url))
