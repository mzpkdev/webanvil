export default {
    format: { printWidth: 120, semi: false, tabWidth: 4, trailingComma: "none" },
    lint: { rules: { "no-console": "deny" } },
    build: { mode: "node", entry: "src/server.ts", outDir: "dist", sourcemap: true },
    test: { environment: "node", include: ["test/**/*.test.ts"] }
}
