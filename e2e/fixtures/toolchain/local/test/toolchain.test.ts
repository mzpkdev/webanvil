import { expect, it } from "webanvil/test"

it("shares WebAnvil's Vitest instance with its setup adapter", () => {
    ;(expect("project-vitest-shared-instance") as unknown as { toUseProjectVitest(): void }).toUseProjectVitest()
})
