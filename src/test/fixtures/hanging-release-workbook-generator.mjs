import { writeFileSync } from "node:fs";

writeFileSync("child.pid", String(process.pid));
process.on("SIGTERM", () => {});
setInterval(() => {}, 10_000);
