import { defineOption } from "cmdore"

export const config = defineOption({
    name: "config",
    arity: 1,
    hint: "path",
    description: "Use this config file instead of vial's generated defaults"
})
