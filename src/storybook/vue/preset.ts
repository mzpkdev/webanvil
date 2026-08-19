import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

// @ts-expect-error The published framework omits a declaration for its documented preset entry.
import { viteFinal as storybookViteFinal } from "@storybook/vue3-vite/preset"

import { withProjectVitePlugins } from "../project-vite"

// @ts-expect-error The published framework omits a declaration for its documented preset entry.
export * from "@storybook/vue3-vite/preset"

const testAddon = resolve(fileURLToPath(new URL("..", import.meta.url)), "test")

export const addons = [testAddon]

export const viteFinal = async (...arguments_: Parameters<typeof storybookViteFinal>) =>
    storybookViteFinal(await withProjectVitePlugins(arguments_[0], arguments_[1]?.configDir), arguments_[1])
