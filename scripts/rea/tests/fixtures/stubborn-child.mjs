import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("Test profile directory is required.");
process.on("SIGTERM", () => {});
setInterval(() => {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "marker"), "alive");
  } catch {
    /* Parent may be exercising profile cleanup. */
  }
}, 10);
