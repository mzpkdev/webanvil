import { defineCommand } from "cmdore";
import args from "../arguments/args.js";
import { vp } from "../core/vp.js";

export const test = defineCommand({
  name: "test",
  description: "Run tests",
  arguments: [args],
  run: async ({ args }) => {
    return vp("test", args);
  },
});
