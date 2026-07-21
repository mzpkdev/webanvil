import { defineCommand } from "cmdore";
import args from "../arguments/args.js";
import { vp } from "../core/vp.js";

export const build = defineCommand({
  name: "build",
  description: "Build for production",
  arguments: [args],
  run: async ({ args }) => {
    return vp("build", args);
  },
});
