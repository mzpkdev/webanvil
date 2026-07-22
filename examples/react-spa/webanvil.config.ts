import react from "@vitejs/plugin-react"

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
        mode: "web",
        entry: "index.html",
        outDir: "dist"
    },
    plugins: [react()]
}
