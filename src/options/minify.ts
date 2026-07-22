import { defineOption } from "cmdore"
import { z } from "zod"

export const minify = defineOption({
    name: "minify",
    description: "Minify the build output: true or false.",
    arity: 1,
    schema: z.enum(["true", "false"]).transform((value) => value === "true")
})
