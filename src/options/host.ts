import { defineOption } from "cmdore"

export const host = defineOption({
    name: "host",
    arity: 1,
    hint: "host",
    description: "Hostname the server binds to",
    defaultValue: () => "localhost"
})
