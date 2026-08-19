import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { withProjectVitePlugins } from "../project-vite"

// @ts-expect-error The published framework omits a declaration for its documented preset entry.
export * from "@storybook/web-components-vite/preset"

const testAddon = resolve(fileURLToPath(new URL("..", import.meta.url)), "test")

export const addons = [testAddon]

export const viteFinal = withProjectVitePlugins
