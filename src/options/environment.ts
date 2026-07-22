import { defineOption } from "cmdore"

export const environment = defineOption({
    name: "environment",
    description: "Vitest environment to use for this run.",
    arity: 1
})
