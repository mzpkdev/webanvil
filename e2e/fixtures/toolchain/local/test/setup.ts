import { expect } from "vitest"

expect.extend({
    toUseProjectVitest(received: unknown) {
        return {
            message: () => `expected ${String(received)} to use the project Vitest instance`,
            pass: received === "project-vitest-shared-instance"
        }
    }
})
