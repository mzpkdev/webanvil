export default {
    format: { printWidth: 120, semi: false, tabWidth: 4, trailingComma: "none" },
    lint: { rules: { "no-console": "deny" } },
    build: {
        bundle: true,
        entry: "src/index.ts",
        entries: { ".": "src/index.ts" },
        outDir: "dist",
        declaration: true,
        formats: ["esm", "cjs"],
        sourcemap: true
    },
    test: { environment: "node", include: ["test/**/*.test.ts"] }
}
