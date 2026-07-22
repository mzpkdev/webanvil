import { defineArgument } from "cmdore"

export const entry = defineArgument({
    name: "entry",
    description: "Entry file for a web, Node, or bundled library build."
})
