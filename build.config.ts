import { defineBuildConfig } from "obuild/config"

export default defineBuildConfig({
    entries: [
        {
            type: "bundle",
            input: [
                "./src/index.ts",
                "./src/cli.ts",
                "./src/e2e.ts",
                "./src/test.ts",
                "./src/test/config.ts",
                "./src/storybook/test/preset.ts",
                "./src/storybook/react/index.ts",
                "./src/storybook/react/preset.ts",
                "./src/storybook/svelte/index.ts",
                "./src/storybook/svelte/preset.ts",
                "./src/storybook/vue/index.ts",
                "./src/storybook/vue/preset.ts",
                "./src/storybook/web-components/index.ts",
                "./src/storybook/web-components/preset.ts"
            ],
            outDir: "./dist",
            dts: { generator: "tsc" }
        }
    ]
})
