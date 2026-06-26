#!/usr/bin/env node
/**
 * sensor-safety-check
 *
 * Static scan: refuses to ship sensor-related code containing unsafe
 * automation language, fake-live claims, frontend service_role leaks, or
 * unguarded "healthy" wording near invalid/stale/demo tokens.
 *
 * Pure read-only. Exits non-zero on violations.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOTS = ["src/lib/sensor", "src/components/sensor", "src/pages"];
const EXTS = new Set([".ts", ".tsx", ".mjs", ".js"]);

const HARD_PATTERNS = [
  { name: "fake-live wording", re: /\bfake[ _-]?live\b/i },
  { name: "autopilot wording", re: /\bautopilot\b/i },
  { name: "auto-execute wording", re: /\bauto[ _-]?execute\b/i },
  { name: "service_role in frontend", re: /service_role/i },
  { name: "device control wording", re: /\bdevice[ _-]?control\b/i },
];

const SOFT_HEALTHY_RE = /\bhealthy\b/i;
const DEGRADED_TOKENS = /\b(invalid|stale|demo|unknown)\b/i;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(p, out);
    } else {
      const dot = name.lastIndexOf(".");
      if (dot >= 0 && EXTS.has(name.slice(dot))) {
        out.push(p);
      }
    }
  }
  return out;
}

const violations = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative(process.cwd(), file).split(sep).join("/");
    const text = readFileSync(file, "utf8");

    for (const pattern of HARD_PATTERNS) {
      if (pattern.re.test(text)) {
        violations.push(`${rel}: forbidden wording — ${pattern.name}`);
      }
    }

    // Heuristic: any line that calls something "healthy" while also
    // mentioning invalid/stale/demo/unknown on the same line is suspect.
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (SOFT_HEALTHY_RE.test(line) && DEGRADED_TOKENS.test(line)) {
        // Allow comments/tests that explicitly assert the negative.
        if (/not\s+(be\s+)?healthy|never\s+healthy|n['o]t\s+match/i.test(line)) return;
        violations.push(
          `${rel}:${i + 1}: "healthy" appears near degraded token (${line.trim()})`,
        );
      }
    });
  }
}

if (violations.length > 0) {
  console.error("sensor-safety-check: violations found");
  for (const v of violations) console.error(" - " + v);
  process.exit(1);
}

console.log("sensor-safety-check: OK (no violations)");
