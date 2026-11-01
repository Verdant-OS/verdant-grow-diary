import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

spawn(
  process.execPath,
  [fileURLToPath(new URL("./stubborn-child.mjs", import.meta.url)), process.argv[2]],
  { stdio: "ignore" },
);
setInterval(() => {}, 1000);
