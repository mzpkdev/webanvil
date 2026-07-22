import { svelte } from "@sveltejs/vite-plugin-svelte"

export default {
    format: { printWidth: 120, semi: false, tabWidth: 4, trailingComma: "none" },
    lint: { rules: { "no-console": "deny" } },
    build: { mode: "web", entry: "index.html", outDir: "dist" },
    plugins: [svelte()]
}
