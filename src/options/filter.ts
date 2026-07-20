import { defineOption } from "cmdore"

export const filter = defineOption({
    name: "filter",
    alias: "f",
    arity: 1,
    hint: "pattern",
    description: "Limit the task to matching workspace packages"
})
