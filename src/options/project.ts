import { defineOption } from "cmdore"
import { z } from "zod"

export const project = defineOption({
    name: "project",
    description: "Run one named Playwright project.",
    arity: 1,
    schema: z.string().min(1)
})
