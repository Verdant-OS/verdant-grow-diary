#!/usr/bin/env node
/**
 * assert-seo-manifest-present
 *
 * Hard precondition gate for the SEO fidelity validators: fails loudly when
 * dist/seo-manifest.json is absent, unreadable, truncated, or structurally
 * meaningless (documents lacking a unique absolute canonical URL, title, or
 * description), before any validator runs. Without this, a wiped dist makes every validator report "0 documents"
 * and the real failure surfaces only as a confusing missing-manifest message
 * from the last validator in the chain.
 *
 * This script never generates or repairs artifacts — it only reports.
 *
 * Usage: node scripts/assert-seo-manifest-present.mjs [distDir]
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const distDir = resolve(process.argv[2] ?? "dist");
const manifestPath = join(distDir, "seo-manifest.json");

function fail(message) {
  console.error(`assert-seo-manifest-present: FAIL — ${message}`);
  process.exit(1);
}

if (!existsSync(distDir)) {
  fail(`build output directory missing at ${distDir}. Run \`bun run build\` first.`);
}
if (!existsSync(manifestPath)) {
  fail(
    `${manifestPath} missing. It is produced by scripts/generate-seo-artifacts.ts during postbuild; ` +
      `the SEO fidelity validators cannot run without it.`,
  );
}
if (!statSync(manifestPath).isFile()) {
  fail(`${manifestPath} exists but is not a file.`);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  fail(`${manifestPath} is not valid JSON: ${error instanceof Error ? error.message : error}`);
}

const MINIMUM_MEANINGFUL_DOCUMENTS = 5;

if (!Array.isArray(manifest?.documents) || manifest.documents.length === 0) {
  fail(`${manifestPath} lists no documents; the SEO validators would vacuously pass.`);
}

if (typeof manifest.origin !== "string" || manifest.origin.trim() === "") {
  fail(`${manifestPath} has no origin; canonical URLs cannot be verified against it.`);
}

let origin;
try {
  origin = new URL(manifest.origin).origin;
} catch {
  fail(`${manifestPath} origin is not an absolute URL: ${JSON.stringify(manifest.origin)}`);
}

if (manifest.documents.length < MINIMUM_MEANINGFUL_DOCUMENTS) {
  fail(
    `${manifestPath} lists only ${manifest.documents.length} document(s); ` +
      `at least ${MINIMUM_MEANINGFUL_DOCUMENTS} are expected for a complete build. ` +
      `A truncated manifest lets the fidelity validators pass while most public routes go unchecked.`,
  );
}

const problems = [];
const seenCanonicals = new Map();
const aliasCanonicals = [];

manifest.documents.forEach((document, index) => {
  const label = typeof document?.path === "string" && document.path.trim() !== ""
    ? document.path
    : `documents[${index}]`;

  if (typeof document?.path !== "string" || document.path.trim() === "") {
    problems.push(`${label}: missing route path.`);
  }
  if (typeof document?.fileName !== "string" || document.fileName.trim() === "") {
    problems.push(`${label}: missing output fileName.`);
  }

  const title = document?.metadata?.title;
  if (typeof title !== "string" || title.trim() === "") {
    problems.push(`${label}: missing head title.`);
  }
  const description = document?.metadata?.description;
  if (typeof description !== "string" || description.trim() === "") {
    problems.push(`${label}: missing head description.`);
  }

  const canonical = document?.metadata?.url;
  if (typeof canonical !== "string" || canonical.trim() === "") {
    problems.push(`${label}: missing canonical URL.`);
    return;
  }

  let parsed;
  try {
    parsed = new URL(canonical);
  } catch {
    problems.push(`${label}: canonical URL is not absolute: ${JSON.stringify(canonical)}`);
    return;
  }

  if (parsed.origin !== origin) {
    problems.push(
      `${label}: canonical URL origin ${parsed.origin} does not match manifest origin ${origin}.`,
    );
  }
  if (!parsed.pathname.startsWith("/")) {
    problems.push(`${label}: canonical URL has no path.`);
  }

  // Duplicate canonicals are legitimate here: alias routes (e.g. /strains/*)
  // intentionally canonicalize onto their primary path (/cultivars/*). Report
  // them so an accidental copy-paste is visible, but do not fail the build.
  const previous = seenCanonicals.get(canonical);
  if (previous !== undefined) {
    aliasCanonicals.push(`${label} -> ${canonical} (primary: ${previous})`);
  } else {
    seenCanonicals.set(canonical, label);
  }
});

if (problems.length > 0) {
  fail(
    `${manifestPath} has ${problems.length} invalid document entr${problems.length === 1 ? "y" : "ies"}:\n  - ` +
      problems.join("\n  - "),
  );
}

console.log(
  `assert-seo-manifest-present: OK — ${manifestPath} present with ${manifest.documents.length} document(s), ` +
    `each with a non-empty absolute canonical URL on ${origin} ` +
    `(${seenCanonicals.size} unique, ${aliasCanonicals.length} alias).`,
);
if (aliasCanonicals.length > 0) {
  console.log(
    `assert-seo-manifest-present: alias canonicals —\n  - ${aliasCanonicals.join("\n  - ")}`,
  );
}
