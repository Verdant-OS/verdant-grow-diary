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
const POSTBUILD_RUNNER = readFileSync(resolve(ROOT, "scripts/run-postbuild-seo.mjs"), "utf8");
const PROBE_MODULE = readFileSync(resolve(ROOT, "scripts/lib/serverBundleEntryProbe.mjs"), "utf8");
const NITRO_SERVER_ENTRY = ".output/server/index.mjs";
const CAPTURE_COMMAND = `node scripts/capture-ssr-head-snapshots-with-server.mjs dist ${NITRO_SERVER_ENTRY}`;

// The server bundle is no longer located by a hard-coded path: both the
// postbuild runner and the capture script resolve it through the shared
// scripts/lib/serverBundleEntryProbe.mjs (explicit override -> nitro.json ->
// wrangler.json -> conventional layouts). These assertions pin that contract
// so a regeneration or refactor cannot silently revert to a hard-coded or
// retired bundle path, while the canonical Nitro entry stays the default for
// the standalone command and a probe candidate.
describe("SEO postbuild SSR snapshot wiring", () => {
  it("routes postbuild through the SEO runner that captures via the probed server bundle", () => {
    expect(PACKAGE.scripts.postbuild).toContain("scripts/run-postbuild-seo.mjs");
    expect(POSTBUILD_RUNNER).toContain("capture-ssr-head-snapshots-with-server.mjs");
    // Pin the live call (env override honored) and that the probed entry is
    // actually handed to the capture process — a dangling import plus a
    // hard-coded capture argument must not satisfy this contract.
    expect(POSTBUILD_RUNNER).toContain(
      'probeServerBundleEntry(distDir, process.env["SEO_SERVER_BUNDLE_ENTRY"])',
    );
    expect(POSTBUILD_RUNNER).toContain("captureArgs.push(probe.entry)");
    expect(POSTBUILD_RUNNER).toContain("./lib/serverBundleEntryProbe.mjs");
  });

  it("keeps the standalone snapshot command on the canonical Nitro server bundle", () => {
    expect(PACKAGE.scripts["seo:snapshots"]).toBe(CAPTURE_COMMAND);
  });

  it("resolves the server bundle through the shared probe with the explicit argument honored", () => {
    expect(CAPTURE_SCRIPT).toContain("probeServerBundleEntry(distDir, process.argv[3])");
    expect(CAPTURE_SCRIPT).toContain("./lib/serverBundleEntryProbe.mjs");
    expect(CAPTURE_SCRIPT).not.toContain('join(distDir, "server", "index.mjs")');
  });

  it("keeps the canonical Nitro entry as a probe candidate", () => {
    // Assert the candidate *expression*, not the bare literal — the literal
    // also appears in the module's header comment, which would keep a
    // deleted candidate green.
    expect(PROBE_MODULE).toContain('resolve(".output", "server", "index.mjs")');
  });
});
