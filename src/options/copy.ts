import { defineOption } from "cmdore"
import { z } from "zod"

import type { CopyMapping } from "../config"

const parseMapping = (value: string): CopyMapping => {
    const separator = value.indexOf("=")
    if (separator <= 0 || separator === value.length - 1) {
        throw new Error(`Invalid copy mapping: ${value}. Expected source=destination.`)
    }

    return { from: value.slice(0, separator), to: value.slice(separator + 1) }
}

export const copy = defineOption({
    name: "copy",
    description: "Copy source=destination mappings after the build.",
    schema: z.array(z.string()).transform((values) => values.map(parseMapping))
})
