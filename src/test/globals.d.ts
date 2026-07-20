import type { describe } from "vitest"

declare global {
    // rspec-style alias for `describe`, assigned in test/setup.ts
    var context: typeof describe
}
