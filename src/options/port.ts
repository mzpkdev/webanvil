import { defineOption } from "cmdore"
import { z } from "zod"

export const port = defineOption({
    name: "port",
    description: "Port for the web development server.",
    arity: 1,
    schema: z.coerce.number().int().min(1).max(65_535)
})
