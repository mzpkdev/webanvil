import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { viteFinal as storybookViteFinal } from "@storybook/react-vite/preset"

import { withProjectVitePlugins } from "../project-vite"

export * from "@storybook/react-vite/preset"

const testAddon = resolve(fileURLToPath(new URL("..", import.meta.url)), "test")

export const addons = [testAddon]

export const viteFinal = async (...arguments_: Parameters<typeof storybookViteFinal>) =>
    storybookViteFinal(await withProjectVitePlugins(arguments_[0]), arguments_[1])
