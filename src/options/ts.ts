import { defineOption } from "cmdore"

export const ts = defineOption({
    name: "ts",
    arity: 0,
    description: "Scaffold a typed webanvil.config.ts instead of the default webanvil.config.json"
})
