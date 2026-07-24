#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  CULTIVAR_SOURCES,
  VERDANT_CULTIVARS,
} from "../src/constants/strainReferenceLibrary.ts";
import {
  classifySourceUrl,
  validateCultivarSourcesStructural,
} from "../src/lib/strainSourceVerification.ts";

const NETWORK_TIMEOUT_MS = 8_000;
const NETWORK_DELAY_MS = 1_200;
const REPORT_PATH = resolve(process.cwd(), "artifacts/source-verification/report.json");
const USER_AGENT =
  "Verdant-Source-Verification/0.1 (+https://verdantgrowdiary.com; provenance hygiene only)";

const args = new Set(process.argv.slice(2));
const strictNetwork = args.has("--strict-network");
const networkEnabled =
  strictNetwork || args.has("--network") || process.env.VERIFY_SOURCES_NETWORK === "1";

if (args.has("--help") || args.has("-h")) {
  console.log(`Automated Source Verification V0

Usage:
  bun scripts/verify-cultivar-sources.mjs
  bun scripts/verify-cultivar-sources.mjs --network
  bun scripts/verify-cultivar-sources.mjs --network --strict-network

Environment:
  VERIFY_SOURCES_NETWORK=1  Enable optional network reachability checks.

Behavior:
  - Structural verification always runs and is CI-safe.
  - Network checks are sequential, rate-limited, and advisory by default.
  - --strict-network exits nonzero only when a critical source is unreachable.
  - No claim values, confidence, verification status, or timestamps are mutated.
`);
  process.exit(0);
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function messageFromError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isCriticalSource(source, classification) {
  return (
    classification === "pubmed" ||
    classification === "scholarly" ||
    classification === "breeder" ||
    source.sourceType === "laboratory" ||
    source.sourceType === "horticultural_reference" ||
    source.sourceType === "breeder"
  );
}

async function requestWithTimeout(url, method) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

  try {
    const headers = {
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1",
      "User-Agent": USER_AGENT,
    };
    if (method === "GET") headers.Range = "bytes=0-2047";

    const response = await fetch(url, {
      method,
      redirect: "follow",
      headers,
      signal: controller.signal,
    });

    try {
      await response.body?.cancel();
    } catch {
      // The status and final URL are enough for this advisory reachability check.
    }

    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: url,
      error: messageFromError(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyNetworkSource(source) {
  const classification = classifySourceUrl(source.url);
  const critical = isCriticalSource(source, classification);
  const checkedAt = new Date().toISOString();

  const head = await requestWithTimeout(source.url, "HEAD");
  if (head.ok) {
    return {
      sourceKey: source.key,
      url: source.url,
      finalUrl: head.finalUrl,
      classification,
      sourceType: source.sourceType,
      critical,
      reachable: true,
      method: "HEAD",
      status: head.status,
      checkedAt,
      error: null,
    };
  }

  const get = await requestWithTimeout(source.url, "GET");
  return {
    sourceKey: source.key,
    url: source.url,
    finalUrl: get.finalUrl,
    classification,
    sourceType: source.sourceType,
    critical,
    reachable: get.ok,
    method: "GET",
    status: get.status,
    headStatus: head.status,
    checkedAt,
    error:
      get.error ??
      (get.status !== null
        ? `HTTP ${get.status}`
        : head.error ?? (head.status !== null ? `HEAD HTTP ${head.status}` : "unreachable")),
  };
}

async function runNetworkChecks() {
  const results = [];

  for (let index = 0; index < CULTIVAR_SOURCES.length; index += 1) {
    const source = CULTIVAR_SOURCES[index];
    console.log(
      `[network ${index + 1}/${CULTIVAR_SOURCES.length}] ${source.key} (${source.url})`,
    );
    results.push(await verifyNetworkSource(source));
    if (index < CULTIVAR_SOURCES.length - 1) await sleep(NETWORK_DELAY_MS);
  }

  const critical = results.filter((result) => result.critical);
  const advisory = results.filter((result) => !result.critical);

  return {
    enabled: true,
    strict: strictNetwork,
    timeoutMs: NETWORK_TIMEOUT_MS,
    delayMs: NETWORK_DELAY_MS,
    summary: {
      checked: results.length,
      reachable: results.filter((result) => result.reachable).length,
      unreachable: results.filter((result) => !result.reachable).length,
      criticalChecked: critical.length,
      criticalReachable: critical.filter((result) => result.reachable).length,
      criticalUnreachable: critical.filter((result) => !result.reachable).length,
      advisoryChecked: advisory.length,
      advisoryReachable: advisory.filter((result) => result.reachable).length,
      advisoryUnreachable: advisory.filter((result) => !result.reachable).length,
    },
    results,
  };
}

const generatedAt = new Date().toISOString();
const structural = validateCultivarSourcesStructural(CULTIVAR_SOURCES, VERDANT_CULTIVARS);
const network = networkEnabled
  ? await runNetworkChecks()
  : {
      enabled: false,
      strict: strictNetwork,
      timeoutMs: NETWORK_TIMEOUT_MS,
      delayMs: NETWORK_DELAY_MS,
      summary: null,
      results: [],
    };

const strictNetworkFailure =
  network.enabled && network.strict && (network.summary?.criticalUnreachable ?? 0) > 0;
const advisoryNetworkWarning =
  network.enabled && (network.summary?.unreachable ?? 0) > 0 && !strictNetworkFailure;

const report = {
  schemaVersion: 1,
  generatedAt,
  status: !structural.ok
    ? "fail"
    : strictNetworkFailure
      ? "fail"
      : advisoryNetworkWarning
        ? "warning"
        : "pass",
  positioning:
    "Automated Source Verification V0 verifies provenance hygiene and reachability evidence; it does not verify scientific truth or elevate evidence states.",
  safety: {
    mutatesClaims: false,
    mutatesConfidence: false,
    mutatesVerificationStatus: false,
    mutatesLastVerifiedAt: false,
    networkOptIn: true,
    humanReviewRequiredForEvidenceElevation: true,
  },
  structural,
  network,
};

await mkdir(dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("\nAutomated Source Verification V0");
console.log(
  `Structural: ${structural.ok ? "PASS" : "FAIL"} — ${structural.uniqueSourceKeys}/${structural.sourceCount} unique sources, ${structural.claimLinkCount} linked references`,
);
console.log(`Classifications: ${JSON.stringify(structural.byClassification)}`);
if (structural.issues.length > 0) {
  for (const issue of structural.issues) {
    console.error(
      `${issue.severity.toUpperCase()} ${issue.code}${issue.sourceKey ? ` [${issue.sourceKey}]` : ""}: ${issue.message}`,
    );
  }
}

if (!network.enabled) {
  console.log("Network: not requested (offline structural mode)");
} else {
  console.log(
    `Network: ${network.summary.reachable}/${network.summary.checked} reachable; critical ${network.summary.criticalReachable}/${network.summary.criticalChecked}; advisory ${network.summary.advisoryReachable}/${network.summary.advisoryChecked}`,
  );
  for (const result of network.results.filter((item) => !item.reachable)) {
    const level = result.critical ? "CRITICAL" : "ADVISORY";
    console.warn(
      `${level} unreachable [${result.sourceKey}] status=${result.status ?? "none"} error=${result.error ?? "unknown"}`,
    );
  }
}

console.log(`Report: ${REPORT_PATH}`);

if (!structural.ok || strictNetworkFailure) process.exitCode = 1;
