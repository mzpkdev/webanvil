import { defineOption } from "cmdore"

export const deep = defineOption({
    name: "deep",
    arity: 0,
    description: "Also remove node_modules"
})
