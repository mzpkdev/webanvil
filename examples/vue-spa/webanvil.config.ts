import vue from "@vitejs/plugin-vue"

export default {
    format: { printWidth: 120, semi: false, tabWidth: 4, trailingComma: "none" },
    lint: { rules: { "no-console": "deny" } },
    build: { mode: "web", entry: "index.html", outDir: "dist" },
    plugins: [vue()]
}
