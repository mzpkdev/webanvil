import react from "@vitejs/plugin-react"

export default {
    build: {
        mode: "web",
        entry: "index.html",
        outDir: "dist"
    },
    plugins: [react()]
}
