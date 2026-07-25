import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: "unit",
                    exclude: ["test/package-consumer.test.ts"],
                    include: ["test/**/*.test.ts"]
                }
            },
            {
                extends: true,
                test: {
                    name: "integration",
                    fileParallelism: false,
                    include: ["e2e/**/*.e2e.ts", "test/package-consumer.test.ts"]
                }
            }
        ]
    }
})
