import { defineBuildConfig } from "unbuild"

// Two entries: the library surface (src/index) and the executable CLI (src/cli,
// whose shebang unbuild preserves and marks +x). Emits ESM + d.ts; workspace
// consumers import ./src directly, publish swaps to ./dist via publishConfig.
export default defineBuildConfig({
    entries: ["src/index", "src/cli"],
    declaration: true,
    clean: true,
    rollup: {
        emitCJS: false
    }
})
