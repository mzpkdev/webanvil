import { defineOption } from "cmdore"
import { z } from "zod"

export const platform = defineOption({
    name: "platform",
    description: "Node build platform: node, browser, or neutral.",
    arity: 1,
    schema: z.enum(["node", "browser", "neutral"])
})
