#!/usr/bin/env node
/**
 * capture-ssr-head-snapshots-with-server
 *
 * Build-time counterpart to scripts/capture-ssr-head-snapshots.ts (which needs
 * an externally running app). Here the freshly built server bundle
 * (currently .output/server/index.mjs — a fetch-handler worker) is imported
 * in-process and
 * every document in dist/seo-manifest.json is rendered through it, writing the
 * real SSR HTML to dist/<fileName> for the head-fidelity gate.
 *
 * A bundle that cannot be loaded or a route that does not render is reported as
 * BLOCKED / a listed failure — never silently as passing head fidelity.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  formatServerBundleProbe,
  probeServerBundleEntry,
} from "./lib/serverBundleEntryProbe.mjs";

const distDir = resolve(process.argv[2] ?? "dist");
// The server bundle location depends on the Nitro/Vite output layout, which has
// moved between `.output/server` and `<dist>/server`. Probe the known locations
// (explicit argument first) instead of hard-coding one, but never silently pass
// when none of them exist.
const probe = probeServerBundleEntry(distDir, process.argv[3]);
const manifestPath = join(distDir, "seo-manifest.json");
const origin = process.env["SEO_SNAPSHOT_ORIGIN"] ?? "https://verdantgrowdiary.com";

// Configuration flag: when SEO_SNAPSHOT_CAPTURE_NONFATAL is truthy, a capture
// BLOCKED/failure is reported as a WARNING and this step exits 0 instead of
// failing the production build. This never converts a defect into a pass: the
// downstream assert-ssr-head-snapshots-present + head-fidelity gates still run
// and still fail hard if snapshots are missing or malformed. It only lets the
// build proceed far enough for those gates to report the real diagnosis.
const NONFATAL_VALUES = new Set(["1", "true", "yes", "on"]);
const nonFatal = NONFATAL_VALUES.has(
  (process.env["SEO_SNAPSHOT_CAPTURE_NONFATAL"] ?? "").trim().toLowerCase(),
);

function abort(message) {
  if (nonFatal) {
    console.warn(
      `capture-ssr-head-snapshots-with-server: WARNING (non-fatal, SEO_SNAPSHOT_CAPTURE_NONFATAL set) — ${message}`,
    );
    console.warn(
      "capture-ssr-head-snapshots-with-server: continuing; downstream SSR head snapshot gates remain fatal.",
    );
    process.exit(0);
  }
  console.error(`capture-ssr-head-snapshots-with-server: ${message}`);
  process.exit(1);
}

const entry = probe.entry;
console.log(formatServerBundleProbe(probe, "capture-ssr-head-snapshots-with-server"));
if (!entry) {
  abort("BLOCKED — no server bundle found at any probed location.");
}

if (!existsSync(manifestPath)) {
  abort(`BLOCKED — ${manifestPath} missing; run scripts/generate-seo-artifacts.ts first.`);
}

let handler;
try {
  const mod = await import(pathToFileURL(entry).href);
  handler = mod.default;
} catch (error) {
  abort(
    `BLOCKED — could not load ${entry}: ${error instanceof Error ? error.message : String(error)}`,
  );
}
if (typeof handler?.fetch !== "function") {
  abort("BLOCKED — server bundle exports no fetch handler.");
}


const ctx = { waitUntil() {}, passThroughOnException() {} };
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const failures = [];
let written = 0;

for (const document of manifest.documents) {
  try {
    const response = await handler.fetch(new Request(`${origin}${document.path}`), {}, ctx);
    if (response.status !== 200) {
      failures.push(`${document.path}: HTTP ${response.status}`);
      continue;
    }
    const filePath = join(distDir, document.fileName);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, await response.text());
    written += 1;
  } catch (error) {
    failures.push(`${document.path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(
    `capture-ssr-head-snapshots-with-server: ${failures.length} document(s) failed to render:`,
  );
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`capture-ssr-head-snapshots-with-server: ${written} SSR snapshot(s) -> ${distDir}`);
