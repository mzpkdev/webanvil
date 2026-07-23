import { describe, expect, it } from "vitest"

import { greet } from "../index"

describe("greet", () => {
    it("greets a name", () => {
        expect(greet("WebAnvil")).toBe("Hello, WebAnvil!")
    })
})
