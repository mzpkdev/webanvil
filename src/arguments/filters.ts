import { defineArgument } from "cmdore"

export const filters = defineArgument({
    name: "filters",
    description: "Test files or names to run.",
    variadic: true
})
