import { writeFileSync } from "node:fs"
import path from "node:path"
import { configJsonSchema } from "./config"

/** Filename of the JSON Schema shipped at webanvil's package root. A consumer's webanvil.config.json
 *  references it as `./node_modules/@crazy-pocs/webanvil/webanvil.schema.json`. */
export const SCHEMA_FILE = "webanvil.schema.json"

/** The schema file's contents: the generated JSON Schema, pretty-printed with a trailing newline. */
export const schemaText = (): string => `${JSON.stringify(configJsonSchema(), null, 4)}\n`

// `bun run schema` regenerates the committed schema from the same zod schema that validates config.
if (import.meta.main) {
    const out = path.join(import.meta.dirname, "..", SCHEMA_FILE)
    writeFileSync(out, schemaText())
    console.log(`webanvil: wrote ${out}`)
}
