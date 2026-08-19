import { defineOption } from "cmdore"

export const debug = defineOption({
    name: "debug",
    description: "Run browser tests in Playwright debug mode.",
    arity: 0
})
