import { defineOption } from "cmdore"

export const host = defineOption({
    name: "host",
    description: "Host interface for the web server.",
    arity: 1
})
