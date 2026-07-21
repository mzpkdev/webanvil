import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  clean: true,
  declaration: true,
  entries: ["commands/index", "core/vp"],
  externals: ["cmdore", "vite-plus"],
  rollup: {
    emitCJS: true,
  },
});
