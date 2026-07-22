import { defineOption } from "cmdore"

export const check = defineOption({
    name: "check",
    description: "Check formatting without writing files.",
    arity: 0
})
