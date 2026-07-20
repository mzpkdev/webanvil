import { defineOption } from "cmdore"

export const watch = defineOption({
    name: "watch",
    alias: "w",
    arity: 0,
    description: "Watch for changes and re-run"
})
