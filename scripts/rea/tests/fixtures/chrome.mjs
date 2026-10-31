#!/usr/bin/env node
import { writeFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const dir = process.env.VERDANT_REA_FIXTURE_DIR;
if (!dir) throw new Error("Test fixture directory is required.");
const { mode } = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
const profile = process.argv
  .find((value) => value.startsWith("--user-data-dir="))
  .slice("--user-data-dir=".length);
writeFileSync(join(dir, "profile"), profile);
writeFileSync(join(dir, "browser-pid"), String(process.pid));
const server = createServer((_request, response) =>
  response.end(
    JSON.stringify([{ type: "page", url: "https://verdantgrowdiary.com/", id: "fixture" }]),
  ),
);
server.listen(0, "127.0.0.1", () => {
  if (mode !== "startup")
    writeFileSync(join(profile, "DevToolsActivePort"), `${server.address().port}\n`);
});
