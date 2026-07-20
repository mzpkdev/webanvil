import { defineOption } from "cmdore"

export const sourcemap = defineOption({
    name: "sourcemap",
    alias: "s",
    arity: 0,
    description: "Emit a source map next to the output"
})
