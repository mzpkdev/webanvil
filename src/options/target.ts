import { defineOption } from "cmdore"

export const target = defineOption({
    name: "target",
    alias: "t",
    arity: 1,
    hint: "target",
    description: "Runtime to target: browser, bun, or node",
    defaultValue: () => "browser"
})
