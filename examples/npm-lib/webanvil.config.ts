import { definePlugin } from "webanvil"
import { createUnplugin } from "unplugin"

const replace = createUnplugin<{ from: string; to: string }>((options) => ({
    name: "replace",
    transform: (code) => code.replace(options.from, options.to)
}))

export default {
    format: { printWidth: 120, semi: false, tabWidth: 4, trailingComma: "none" },
    lint: { rules: { "no-console": "deny" } },
    build: {
        bundle: true,
        entry: "index.ts",
        entries: { ".": "index.ts", "./feature": "feature.ts" },
        outDir: ".",
        sourcemap: true
    },
    plugins: [definePlugin(replace, { from: "Hello", to: "Hello from a plugin" })],
    test: { environment: "node", include: ["test/**/*.test.ts"] }
}
