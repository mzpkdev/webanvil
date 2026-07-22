export default {
    build: {
        mode: "node",
        entry: "src/server.ts",
        outDir: "dist",
        declaration: true,
        sourcemap: true,
        minify: true,
        formats: ["esm", "cjs"],
        target: "node20"
    }
}
