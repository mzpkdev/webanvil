import { defineCommand } from "cmdore";
import args from "../arguments/args.js";
import { vp } from "../core/vp.js";

export const run = defineCommand({
  name: "run",
  description: "Run tasks",
  arguments: [args],
  run: async ({ args }) => {
    return vp("run", args);
  },
});
