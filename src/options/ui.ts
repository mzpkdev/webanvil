import { defineOption } from "cmdore"

export const ui = defineOption({
    name: "ui",
    description: "Start the Vitest user interface.",
    arity: 0
})
