import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const PACKAGE = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const CAPTURE_SCRIPT = readFileSync(
  resolve(ROOT, "scripts/capture-ssr-head-snapshots-with-server.mjs"),
  "utf8",
);
const NITRO_SERVER_ENTRY = ".output/server/index.mjs";
const CAPTURE_COMMAND = `node scripts/capture-ssr-head-snapshots-with-server.mjs dist ${NITRO_SERVER_ENTRY}`;

describe("SEO postbuild SSR snapshot wiring", () => {
  it("passes the current Nitro server bundle to the postbuild snapshot capture", () => {
    expect(PACKAGE.scripts.postbuild).toContain(CAPTURE_COMMAND);
  });

  it("keeps the standalone snapshot command on the same server bundle", () => {
    expect(PACKAGE.scripts["seo:snapshots"]).toBe(CAPTURE_COMMAND);
  });

  it("uses the explicit server bundle argument instead of the retired dist/server path", () => {
    expect(CAPTURE_SCRIPT).toContain('process.argv[3] ?? ".output/server/index.mjs"');
    expect(CAPTURE_SCRIPT).not.toContain('join(distDir, "server", "index.mjs")');
  });
});
