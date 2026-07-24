import { defineOption } from "cmdore"

export const bundle = defineOption({
    name: "bundle",
    description: "Bundle one or more explicit Node entries; without it, preserve the source module tree.",
    arity: 0
})
