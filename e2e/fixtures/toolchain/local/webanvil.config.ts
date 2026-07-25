import { createUnplugin } from "unplugin"
import { defineConfig, definePlugin } from "webanvil"

const projectPlugin = createUnplugin(() => ({
    name: "toolchain-project-plugin",
    transform(code) {
        return code
            .replace("LOCAL_VITE_PLUGIN_INPUT", "local-vite-project-plugin")
            .replace("LOCAL_ROLLDOWN_PLUGIN_INPUT", "local-rolldown-project-plugin")
    }
}))

export default defineConfig({
    build: {
        bundle: true,
        declaration: { generator: "tsc" },
        entry: "src/node.ts",
        formats: ["esm"],
        mode: "node",
        outDir: "node-dist"
    },
    format: { singleQuote: true },
    lint: { rules: { "no-debugger": "deny" } },
    plugins: [definePlugin(projectPlugin, {})],
    test: {
        include: ["test/**/*.test.ts"],
        setupFiles: ["test/setup.ts"]
    },
    vite: {
        base: "/local-toolchain/",
        build: { minify: false }
    }
})
