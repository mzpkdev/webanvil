import { defineOption } from "cmdore"

export const check = defineOption({
    name: "check",
    alias: "c",
    arity: 0,
    description: "Verify without writing changes"
})
