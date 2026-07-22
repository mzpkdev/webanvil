import { defineOption } from "cmdore"
import { z } from "zod"

export const declaration = defineOption({
    name: "declaration",
    description: "Emit TypeScript declarations for a Node build.",
    arity: 1,
    schema: z.enum(["true", "false"]).transform((value) => value === "true")
})
