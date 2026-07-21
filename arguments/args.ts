import { defineArgument } from "cmdore";

export default defineArgument({
  name: "args",
  variadic: true,
  description: "Arguments forwarded to Vite+ after --",
});
