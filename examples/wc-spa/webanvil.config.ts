export default {
    build: {
        mode: "web",
        entry: "index.html",
        outDir: "dist"
    },
    test: {
        environment: "jsdom",
        include: ["test/**/*.test.ts"]
    }
}
