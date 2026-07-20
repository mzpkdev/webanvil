import { defineOption } from "cmdore"

export const fix = defineOption({
    name: "fix",
    alias: "f",
    arity: 0,
    description: "Apply safe fixes automatically"
})
