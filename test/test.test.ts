import { describe, expect, it } from "vitest"

import { test } from "../src/commands/test"

describe("test", () => {
    it("requires UI mode when selecting a UI port", async () => {
        await expect(test([], "node", undefined, { uiPort: 51_204 })).rejects.toThrow("--ui-port requires --ui")
    })
})
