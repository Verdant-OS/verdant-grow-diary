#!/usr/bin/env bun
/**
 * capture-ssr-head-snapshots
 *
 * Fetches every document listed in dist/seo-manifest.json from a running
 * Verdant server and writes the response HTML to dist/<fileName>.
 *
 * Why real responses instead of build-time synthesized HTML: under SSR the
 * route's own head() is what a crawler actually receives, so the head-fidelity
 * gate must compare the manifest against the served bytes. Snapshots are
 * written to the dist ROOT (dist/client is the public dir) so they are
 * verification artifacts only and can never shadow an SSR route.
 *
 * Server URL: SEO_SNAPSHOT_BASE_URL, default http://localhost:8080. If nothing
 * answers there, this script fails loudly rather than emitting empty files —
 * an unreachable server must never read as head drift, and drift must never
 * read as an unreachable server.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const distDir = resolve(process.argv[2] ?? "dist");
const baseUrl = (process.env["SEO_SNAPSHOT_BASE_URL"] ?? "http://localhost:8080").replace(
  /\/$/,
  "",
);
const manifestPath = join(distDir, "seo-manifest.json");

if (!existsSync(manifestPath)) {
  console.error(
    `capture-ssr-head-snapshots: ${manifestPath} missing — run scripts/generate-seo-artifacts.ts first.`,
  );
  process.exit(1);
}

interface ManifestDocument {
  path: string;
  fileName: string;
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  documents: ReadonlyArray<ManifestDocument>;
};

async function reachable(): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
    return response.status < 500;
  } catch {
    return false;
  }
}

if (!(await reachable())) {
  console.error(
    `capture-ssr-head-snapshots: BLOCKED — no server answering at ${baseUrl}. ` +
      `Start the app (bun run dev) or set SEO_SNAPSHOT_BASE_URL.`,
  );
  process.exit(1);
}

const failures: string[] = [];
let written = 0;

for (const document of manifest.documents) {
  const url = `${baseUrl}${document.path}`;
  try {
    const response = await fetch(url, { redirect: "manual" });
    if (response.status !== 200) {
      failures.push(`${document.path}: HTTP ${response.status}`);
      continue;
    }
    const html = await response.text();
    const filePath = join(distDir, document.fileName);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, html);
    written += 1;
  } catch (error) {
    failures.push(`${document.path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(
  `capture-ssr-head-snapshots: ${written}/${manifest.documents.length} snapshots from ${baseUrl}`,
);
if (failures.length > 0) {
  console.error(`capture-ssr-head-snapshots: ${failures.length} unreachable route(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
