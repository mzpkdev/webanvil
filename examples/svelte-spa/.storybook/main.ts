import { framework, type StorybookConfig } from "webanvil/storybook/svelte"

export default {
    framework,
    stories: ["../src/**/*.stories.@(js|ts|svelte)"]
} satisfies StorybookConfig
