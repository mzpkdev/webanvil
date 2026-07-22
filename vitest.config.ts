import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        include: ["test/**/*.test.ts", "e2e/**/*.e2e.ts"]
    }
})
