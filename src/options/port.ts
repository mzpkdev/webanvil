import { defineOption } from "cmdore"

export const port = defineOption({
    name: "port",
    alias: "p",
    arity: 1,
    hint: "port",
    description: "Port the server listens on",
    defaultValue: () => "3000"
})
