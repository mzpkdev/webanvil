import { defineOption } from "cmdore"

export const open = defineOption({
    name: "open",
    description: "Open Storybook or the preview in the browser.",
    arity: 0
})
