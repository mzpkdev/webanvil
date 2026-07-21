import { defineCommand } from "cmdore";
import args from "../arguments/args.js";
import { vp } from "../core/vp.js";

export const dev = defineCommand({
  name: "dev",
  description: "Start the development server",
  arguments: [args],
  run: async ({ args }) => {
    return vp("dev", args);
  },
});
