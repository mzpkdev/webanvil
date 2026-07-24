import { defineOption } from "cmdore"
import { z } from "zod"

import { syntaxTargetSchema } from "../config"

export const target = defineOption({
    name: "target",
    description: "Production syntax target, or comma-separated targets.",
    arity: 1,
    schema: z
        .string()
        .min(1)
        .transform((value) => {
            const values = value.split(",").map((part) => part.trim())
            return values.length === 1 ? values[0]! : values
        })
        .pipe(syntaxTargetSchema)
})
