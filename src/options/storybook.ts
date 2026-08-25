import { defineOption } from "cmdore"

export const storybook = defineOption({
    name: "storybook",
    description: "Also run the configured Storybook companion workflow.",
    arity: 0
})
