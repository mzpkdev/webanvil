import { defineOption } from "cmdore"

export const fix = defineOption({
    name: "fix",
    description: "Apply safe lint fixes.",
    arity: 0
})
