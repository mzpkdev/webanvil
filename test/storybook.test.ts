import { describe, expect, it } from "vitest"

import { createStorybookTestProject } from "../src/core/storybook"

describe("createStorybookTestProject", () => {
    it("rejects a Vitest version that does not match the bundled browser provider", async () => {
        await expect(createStorybookTestProject({}, "4.1.11")).rejects.toThrow("Storybook tests require Vitest 4.1.10")
    })
})
