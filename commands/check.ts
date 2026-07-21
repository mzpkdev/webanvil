import { defineCommand } from "cmdore";
import args from "../arguments/args.js";
import { vp } from "../core/vp.js";

export const check = defineCommand({
  name: "check",
  description: "Run format, lint, and type checks",
  arguments: [args],
  run: async ({ args }) => {
    return vp("check", args);
  },
});
