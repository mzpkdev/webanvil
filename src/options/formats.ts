import { defineOption } from "cmdore"
import { z } from "zod"

export const formats = defineOption({
    name: "formats",
    description: "Comma-separated Node output formats: esm,cjs.",
    arity: 1,
    schema: z
        .string()
        .transform((value) => value.split(","))
        .pipe(z.array(z.enum(["esm", "cjs"])).min(1))
})
