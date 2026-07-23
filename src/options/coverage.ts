import { defineOption } from "cmdore"

export const coverage = defineOption({
    name: "coverage",
    description: "Collect test coverage with V8.",
    arity: 0
})
