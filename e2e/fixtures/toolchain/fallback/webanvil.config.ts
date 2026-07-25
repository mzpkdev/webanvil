export default {
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
    test: {
        globals: true,
        include: ["test/**/*.test.ts"]
    },
    vite: {
        base: "/fallback-toolchain/",
        build: { minify: false }
    }
}
