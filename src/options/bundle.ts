import { defineOption } from "cmdore"

export const bundle = defineOption({
    name: "bundle",
    description: "Bundle the Node public roots; without it, emit their reachable graph with preserveModules.",
    arity: 0
})
