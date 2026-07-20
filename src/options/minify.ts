import { defineOption } from "cmdore"

export const minify = defineOption({
    name: "minify",
    alias: "m",
    arity: 0,
    description: "Minify the output for production"
})
