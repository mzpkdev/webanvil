import { defineOption } from "cmdore"

export const headed = defineOption({
    name: "headed",
    description: "Run browser tests with a visible browser window.",
    arity: 0
})
