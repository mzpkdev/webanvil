import { defineOption } from "cmdore"
import { z } from "zod"

export const sourcemap = defineOption({
    name: "sourcemap",
    description: "Generate source maps: true or false.",
    arity: 1,
    schema: z.enum(["true", "false"]).transform((value) => value === "true")
})
