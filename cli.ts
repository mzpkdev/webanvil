import { execute } from "cmdore";
import { build, check, dev, pack, run, test } from "./commands/index.js";

void execute([build, check, dev, pack, run, test], {
  metadata: {
    name: "webanvil",
    version: "1.0.0",
  },
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
