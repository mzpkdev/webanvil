import { copyFile } from "node:fs/promises"

const presets = [
    "dist/storybook/react/preset",
    "dist/storybook/svelte/preset",
    "dist/storybook/vue/preset",
    "dist/storybook/web-components/preset",
    "dist/storybook/test/preset"
]

await Promise.all(presets.map((preset) => copyFile(`${preset}.mjs`, preset)))
