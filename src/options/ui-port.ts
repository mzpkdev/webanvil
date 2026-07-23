import { defineOption } from "cmdore"
import { z } from "zod"

export const uiPort = defineOption({
    name: "ui-port",
    description: "Port for the Vitest user interface.",
    arity: 1,
    schema: z.coerce.number().int().min(1).max(65_535)
})
