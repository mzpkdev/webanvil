import { defineArgument } from "cmdore"

export const entry = defineArgument({
    name: "entry",
    description: "Web entry or Node public root; unbundled Node builds emit its reachable graph with preserveModules."
})
