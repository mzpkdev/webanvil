import { expect, it } from "vitest"

it("shares the project Vitest instance with its setup adapter", () => {
    ;(expect("project-vitest-shared-instance") as unknown as { toUseProjectVitest(): void }).toUseProjectVitest()
})
