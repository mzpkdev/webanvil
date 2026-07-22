import { defineOption } from "cmdore"

export const bundle = defineOption({
    name: "bundle",
    description: "Bundle a Node entry instead of preserving its source module tree.",
    arity: 0
})
