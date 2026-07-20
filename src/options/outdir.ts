import { defineOption } from "cmdore"

export const outdir = defineOption({
    name: "outdir",
    alias: "o",
    arity: 1,
    hint: "dir",
    description: "Directory to write build output into",
    defaultValue: () => "dist"
})
