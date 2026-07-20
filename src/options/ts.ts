import { defineOption } from "cmdore"

export const ts = defineOption({
    name: "ts",
    arity: 0,
    description: "Scaffold a typed vial.config.ts instead of the default vial.config.json"
})
