import { SCHEMA_FILE, schemaText } from "./schema"

describe("schema module", () => {
    it("names the schema file shipped at the package root", () => {
        expect(SCHEMA_FILE).toBe("webanvil.schema.json")
    })

    it("serializes the config JSON Schema as an object schema with a trailing newline", () => {
        const text = schemaText()
        expect(text.endsWith("}\n")).toBe(true)
        expect(JSON.parse(text).type).toBe("object")
    })
})
