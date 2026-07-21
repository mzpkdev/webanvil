import { defineCommand } from "cmdore";
import args from "../arguments/args.js";
import { vp } from "../core/vp.js";

export const pack = defineCommand({
  name: "pack",
  description: "Bundle files",
  arguments: [args],
  run: async ({ args }) => {
    return vp("pack", args);
  },
});
