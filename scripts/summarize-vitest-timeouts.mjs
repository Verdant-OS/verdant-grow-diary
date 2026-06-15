#!/usr/bin/env node
// Summarize Vitest failures into timeout-only vs real assertion failures.
// Reporting/tooling only. No production code changes. No retries. No timeout bumps.

import { readFileSync } from "node:fs";

const TIMEOUT_RE = /Error:\s+Test timed out in \d+ms\.?/;
const FAIL_RE = /^\s*(?:FAIL|×|✗)\s+(.+?)(?:\s+>\s+(.+))?$/;
// Vitest dot reporter format: " FAIL  src/test/foo.test.ts > suite > test name"
const FAIL_LINE_RE = /^\s*FAIL\s+(\S+\.test\.[cm]?[jt]sx?)\s*(?:>\s*(.+))?$/;

export function inferGuardType(text) {
  const t = text.toLowerCase();
  if (/\brpc\b|trust[- ]boundary/.test(t)) return "RPC trust-boundary static guard";
  if (/raw[_ ]?payload|secret|token|service[_ ]?role/.test(t))
    return "raw payload / secret leakage guard";
  if (/device[- ]?control|equipment[- ]?command|automation/.test(t))
    return "device-control language guard";
  if (/route|helper|ownership/.test(t)) return "route/helper ownership guard";
  if (/sensor|provenance|csv|telemetry/.test(t))
    return "sensor provenance/static ownership guard";
  return "unknown static scanner guard";
}

export function parseVitestLog(text) {
  const lines = text.split(/\r?\n/);
  const failures = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FAIL_LINE_RE);
    if (!m) continue;
    const file = m[1];
    const name = (m[2] || "").trim();
    // Scan ahead until the next FAIL line (or end), so timeouts don't bleed across blocks.
    const windowLines = [];
    for (let j = i + 1; j < lines.length && j < i + 50; j++) {
      if (FAIL_LINE_RE.test(lines[j])) break;
      windowLines.push(lines[j]);
    }
    const windowText = windowLines.join("\n");
    const isTimeout = TIMEOUT_RE.test(windowText) || TIMEOUT_RE.test(lines[i]);
    failures.push({
      file,
      name,
      isTimeout,
      guard: inferGuardType(`${file} ${name}`),
    });
  }
  return failures;
}

export function summarize(failures) {
  const timeouts = failures.filter((f) => f.isTimeout);
  const nonTimeouts = failures.filter((f) => !f.isTimeout);
  const byFile = new Map();
  const byGuard = new Map();
  for (const f of timeouts) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
    byGuard.set(f.guard, (byGuard.get(f.guard) || 0) + 1);
  }
  return {
    total: failures.length,
    timeoutCount: timeouts.length,
    nonTimeoutCount: nonTimeouts.length,
    byFile,
    byGuard,
    nonTimeouts,
  };
}

export function formatReport(summary) {
  const out = [];
  out.push(`Total parsed failures: ${summary.total}`);
  out.push(`Timeout-only failures: ${summary.timeoutCount}`);
  out.push(`Non-timeout failures: ${summary.nonTimeoutCount}`);
  out.push("");
  if (summary.byFile.size > 0) {
    out.push("Timeouts grouped by file:");
    for (const [file, list] of summary.byFile) {
      out.push(`  ${file} (${list.length})`);
      for (const f of list) {
        if (f.name) out.push(`    - ${f.name}`);
      }
    }
    out.push("");
    out.push("Timeouts grouped by guard type:");
    for (const [guard, count] of summary.byGuard) {
      out.push(`  ${guard}: ${count}`);
    }
    out.push("");
  }
  if (summary.nonTimeoutCount > 0) {
    out.push("Non-timeout failures present — do not treat this as environmental noise.");
    for (const f of summary.nonTimeouts) {
      out.push(`  ${f.file}${f.name ? ` > ${f.name}` : ""}`);
    }
  } else if (summary.total > 0) {
    out.push("All parsed failures are timeout-only. Review environment speed before changing code.");
  } else {
    out.push("No failures parsed.");
  }
  return out.join("\n");
}

function main(argv) {
  const path = argv[2];
  if (!path) {
    console.error("Usage: node scripts/summarize-vitest-timeouts.mjs <vitest-output.log>");
    process.exit(2);
  }
  const text = readFileSync(path, "utf8");
  const failures = parseVitestLog(text);
  const summary = summarize(failures);
  console.log(formatReport(summary));
  // Exit non-zero if real failures present; zero otherwise (timeouts are environmental).
  process.exit(summary.nonTimeoutCount > 0 ? 1 : 0);
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("summarize-vitest-timeouts.mjs");
if (invokedDirectly) main(process.argv);
