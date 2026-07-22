import { defineOption } from "cmdore"
import { z } from "zod"

export const target = defineOption({
    name: "target",
    description: "Node platform target: node20, browser, or neutral.",
    arity: 1,
    schema: z.enum(["node20", "browser", "neutral"])
})
