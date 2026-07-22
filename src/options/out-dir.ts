import { defineOption } from "cmdore"

export const outDir = defineOption({
    name: "out-dir",
    description: "Directory where the build output is written.",
    arity: 1,
    required: true
})
