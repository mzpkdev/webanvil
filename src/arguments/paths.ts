import { defineArgument } from "cmdore"

export const paths = defineArgument({
    name: "paths",
    description: "Files or directories to check.",
    variadic: true
})
