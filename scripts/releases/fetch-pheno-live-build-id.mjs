#!/usr/bin/env node
/**
 * Fetches the production HTML and main Vite bundle, records a stable deployed
 * build fingerprint, then refreshes the release receipt in HOLD-safe mode.
 *
 * Optional expected identifier:
 *   PHENO_EXPECTED_LIVE_BUILD_ID=<bundle id, filename, or sha256 prefix>
 *
 * Output:
 *   artifacts/release-readiness/pheno-tracker-live-smoke/deployed-build.json
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SITE_URL = "https://verdantgrowdiary.com";
const OUT_PATH = path.resolve(
  "artifacts/release-readiness/pheno-tracker-live-smoke/deployed-build.json",
);
const RECEIPT_WRITER = "scripts/releases/write-pheno-release-receipt.mjs";

function firstLine(value) {
  return String(value ?? "").split("\n")[0].slice(0, 220);
}

export function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

export function extractMainBundle(html) {
  const tags = html.match(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>/gi) ?? [];
  const sources = tags
    .map((tag) => tag.match(/\bsrc=["']([^"']+)["']/i)?.[1])
    .filter(Boolean)
    .filter((src) => /\.m?js(?:\?|$)/i.test(src));

  return (
    sources.find((src) => /\/assets\/index-[^/]+\.m?js(?:\?|$)/i.test(src)) ??
    sources.find((src) => /\/assets\//i.test(src)) ??
    sources[0] ??
    null
  );
}

/**
 * Resolve the bundle URL and enforce same-origin (protocol-relative and
 * absolute URLs to other hosts are rejected — a fingerprint must never be
 * taken from a foreign origin).
 */
export function resolveSameOriginBundleUrl(bundleSrc, siteUrl = SITE_URL) {
  const resolved = new URL(bundleSrc, siteUrl);
  if (resolved.origin !== new URL(siteUrl).origin) {
    throw new Error("main bundle resolved to an unexpected origin");
  }
  return resolved.toString();
}

/**
 * Expected identifier may be the EXACT bundle id, the EXACT bundle filename,
 * or a PREFIX of the SHA-256 (>= 8 chars to avoid trivial matches). A prefix
 * of the bundle id/filename deliberately does NOT match.
 */
export function expectedMatches(expected, observed) {
  if (!expected) return null;
  if (observed.bundleId && observed.bundleId === expected) return true;
  if (observed.bundleFile && observed.bundleFile === expected) return true;
  if (
    observed.bundleSha256 &&
    expected.length >= 8 &&
    /^[0-9a-f]+$/i.test(expected) &&
    observed.bundleSha256.toLowerCase().startsWith(expected.toLowerCase())
  ) {
    return true;
  }
  return false;
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fetchWithTimeout(url, responseType) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache",
        "user-agent": "Verdant-Pheno-Release-Fingerprint/1.0",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return {
      response,
      body: responseType === "arrayBuffer" ? await response.arrayBuffer() : await response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const expectedBuildId = process.env.PHENO_EXPECTED_LIVE_BUILD_ID?.trim() || null;
  const htmlResult = await fetchWithTimeout(SITE_URL, "text");
  const html = htmlResult.body;
  const bundleSrc = extractMainBundle(html);
  if (!bundleSrc) throw new Error("main JavaScript bundle was not found in production HTML");

  const bundleUrl = resolveSameOriginBundleUrl(bundleSrc, SITE_URL);

  const bundleResult = await fetchWithTimeout(bundleUrl, "arrayBuffer");
  // Redirect-following could bounce off-origin after the request was made —
  // verify where the bytes actually came from, not just where we asked.
  if (new URL(bundleResult.response.url).origin !== new URL(SITE_URL).origin) {
    throw new Error("main bundle response arrived from an unexpected origin");
  }
  const bytes = Buffer.from(bundleResult.body);
  const bundlePath = new URL(bundleUrl).pathname;
  const bundleFile = path.posix.basename(bundlePath);
  const bundleId = bundleFile.replace(/\.m?js$/i, "");
  const bundleSha256 = sha256Hex(bytes);

  const artifact = {
    status: "PASS",
    observedAt: new Date().toISOString(),
    siteUrl: SITE_URL,
    title: extractTitle(html),
    htmlStatus: htmlResult.response.status,
    bundlePath,
    bundleFile,
    bundleId,
    bundleBytes: bytes.length,
    bundleSha256,
    etag: bundleResult.response.headers.get("etag"),
    lastModified: bundleResult.response.headers.get("last-modified"),
    expectedBuildId,
    expectedMatch: null,
  };

  artifact.expectedMatch = expectedMatches(expectedBuildId, artifact);
  if (artifact.expectedMatch === false) artifact.status = "FAIL";

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(`site         ${SITE_URL}`);
  console.log(`bundle       ${bundleFile}`);
  console.log(`bundle id    ${bundleId}`);
  console.log(`sha256       ${bundleSha256}`);
  console.log(`expected     ${expectedBuildId ? (artifact.expectedMatch ? "MATCH" : "MISMATCH") : "NOT SET"}`);
  console.log(`artifact     ${path.relative(process.cwd(), OUT_PATH)}`);

  const receipt = spawnSync(
    process.execPath,
    [RECEIPT_WRITER, "--build", OUT_PATH, "--allow-partial"],
    { stdio: "inherit", shell: false, env: process.env },
  );
  if ((receipt.status ?? 1) === 1) {
    throw new Error("release receipt writer failed");
  }

  process.exit(artifact.status === "PASS" ? 0 : 1);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`FAIL: ${firstLine(error?.message ?? error)}`);
    process.exit(1);
  });
}
