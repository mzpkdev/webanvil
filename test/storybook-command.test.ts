import { execute } from "cmdore"
import { describe, expect, it } from "vitest"

import buildCommand from "../src/commands/build"
import devCommand from "../src/commands/dev"

describe("Storybook command integration", () => {
    it.each([
        ["build", buildCommand],
        ["dev", devCommand]
    ])("rejects the removed Storybook mode for %s", async (name, command) => {
        await expect(
            execute([command], { argv: [name, "--mode", "storybook"], metadata: { name: "wa" }, onError: "throw" })
        ).rejects.toThrow()
    })
})
