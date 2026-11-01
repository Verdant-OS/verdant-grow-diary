import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const originalRm = fs.promises.rm;
const dir = process.env.VERDANT_REA_FIXTURE_DIR;
fs.promises.rm = async (path, options) => {
  if (dir && String(path).includes(`${sep}rea-out${sep}bundle-map${sep}`)) {
    await fs.promises.writeFile(join(dir, "phase"), "rollback");
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        await fs.promises.access(join(dir, "release"));
        break;
      } catch {
        await delay(20);
      }
    }
  }
  return originalRm(path, options);
};
syncBuiltinESMExports();
