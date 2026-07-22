import { defineOption } from "cmdore"
import { z } from "zod"

export const mode = defineOption({
    name: "mode",
    description: "Build mode: web uses Vite and node uses Rolldown.",
    arity: 1,
    schema: z.enum(["web", "node"])
})
