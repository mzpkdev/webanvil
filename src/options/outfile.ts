import { defineOption } from "cmdore"

export const outfile = defineOption({
    name: "outfile",
    alias: "o",
    arity: 1,
    hint: "file",
    description: "File path for the bundled output",
    defaultValue: () => "dist/bundle.js"
})
