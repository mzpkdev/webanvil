import { defineOption } from "cmdore"

export const coverage = defineOption({
    name: "coverage",
    alias: "c",
    arity: 0,
    description: "Measure and report code coverage"
})
