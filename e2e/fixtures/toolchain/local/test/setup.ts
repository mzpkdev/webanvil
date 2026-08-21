import { expect } from "webanvil/test"

expect.extend({
    toUseProjectVitest(received: unknown) {
        return {
            message: () => `expected ${String(received)} to use WebAnvil's Vitest instance`,
            pass: received === "project-vitest-shared-instance"
        }
    }
})
