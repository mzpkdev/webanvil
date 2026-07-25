import { defineConfig, definePlugin } from "webanvil"
import { createUnplugin } from "unplugin"

const replace = createUnplugin<{ from: string; to: string }>((options) => ({
    name: "replace",
    transform: (code) => code.replace(options.from, options.to)
}))

export default defineConfig({
    format: { printWidth: 120, semi: false, tabWidth: 4, trailingComma: "none" },
    lint: { rules: { "no-console": "deny" } },
    build: {
        bundle: true,
        entries: { ".": "index.ts", "./feature": "src/internal/implementation.ts" },
        outDir: ".",
        sourcemap: true,
        platform: "node",
        target: "es2022"
    },
    plugins: [definePlugin(replace, { from: "Hello", to: "Hello from a plugin" })],
    rolldown: {
        output: {
            esm: { entryFileNames: "[name].js" },
            cjs: { entryFileNames: "[name].cjs" }
        }
    },
    test: { environment: "node", include: ["test/**/*.test.ts"] }
})
