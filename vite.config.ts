import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    clean: true,
    dts: true,
    entry: {
      "commands/index": "commands/index.ts",
      "core/vp": "core/vp.ts",
      cli: "cli.ts",
    },
    format: ["esm", "cjs"],
  },
});
