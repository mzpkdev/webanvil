import { expect, it } from "webanvil/test"

it("runs with WebAnvil's Vitest fallback", () => {
    expect("fallback-vitest-behavior").toBe("fallback-vitest-behavior")
})
