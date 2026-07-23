import { defineOption } from "cmdore"

export const watch = defineOption({
    name: "watch",
    description: "Watch test files and rerun affected tests.",
    arity: 0
})
