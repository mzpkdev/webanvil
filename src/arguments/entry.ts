import { defineArgument } from "cmdore"

export const entry = defineArgument({
    name: "entry",
    description: "Web entry, unbundled Node source-tree anchor, or single bundled Node entry."
})
