import { defineArgument } from "cmdore"

export const entry = defineArgument({
    name: "entry",
    description: "Source file to bundle for a library build.",
    required: true
})
