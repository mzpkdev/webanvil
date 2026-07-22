export default {
    format: {
        arrowParens: "always",
        bracketSameLine: false,
        bracketSpacing: true,
        jsxSingleQuote: false,
        printWidth: 120,
        quoteProps: "as-needed",
        semi: false,
        singleQuote: false,
        tabWidth: 4,
        trailingComma: "none",
        useTabs: false
    },
    lint: { rules: { "no-console": "deny" } },
    build: {
        mode: "node",
        entry: "src/server.ts",
        outDir: "dist",
        sourcemap: true,
        minify: true,
        target: "node20"
    }
}
