#!/usr/bin/env node
/**
 * Verdant AI Doctor Action Queue Suggestion Preview — Safety Scanner
 * ------------------------------------------------------------------
 * Dependency-free static check that scans the preview helper + presenter
 * for unsafe executable / write-path language. Keeps the read-only
 * preview from drifting into an Action Queue write, automation, or
 * device-control feature.
 *
 * Scans:
 *   - src/lib/aiDoctorActionSuggestionPreviewRules.ts
 *   - src/components/AiDoctorContextReadinessPanel.tsx
 *
 * Each violation prints:
 *   <file>:<line> [<rule>] "<text>" — <explanation>
 *
 * A line is skipped (not scanned) when ANY of these hold:
 *   - file path is inside src/test/**
 *   - line is a JS/TS comment (starts with `*`, `//`, or `/*`)
 *   - line is a regex-pattern declaration (e.g. `/\bturn_on\b/i`)
 *   - line contains the marker `AI-DOCTOR-PREVIEW-SAFETY: ALLOW`
 *   - line contains a denial/safety context word
 *     (never, not, n't, cannot, blocked, drop, prohibit, prevent,
 *      guard, refuse, forbid, safety filter, defence/defense)
 *   - line contains one of the allow phrases:
 *       "Approval required"
 *       "No device control"
 *       "Preview only"
 *       "no queue item created"
 *       "no Action Queue item is created"
 *       "will not run equipment commands"
 *
 * Usage:
 *   node scripts/assert-ai-doctor-preview-safety.mjs
 *
 * Exit codes:
 *   0 — no violations
 *   1 — one or more violations
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
export const ALLOW_MARKER = "AI-DOCTOR-PREVIEW-SAFETY: ALLOW";

export const SCAN_TARGETS = [
  "src/lib/aiDoctorActionSuggestionPreviewRules.ts",
  "src/components/AiDoctorContextReadinessPanel.tsx",
];

export const ALLOW_PHRASES = [
  "approval required",
  "no device control",
  "preview only",
  "no queue item created",
  "no action queue item is created",
  "will not run equipment commands",
];

export const RULES = [
  {
    name: "no-approved-language",
    pattern: /\bapproved\b/i,
    explanation:
      "Preview must never claim a suggestion was approved — Action Queue items remain approval-required.",
  },
  {
    name: "no-queued-language",
    pattern: /\b(queued|added to (the )?queue)\b/i,
    explanation:
      "Preview must never claim a suggestion was queued — it does not write to the Action Queue.",
  },
  {
    name: "no-executed-language",
    pattern: /\bexecuted?\b/i,
    explanation:
      "Preview must never claim an action was executed — no device commands run from the preview.",
  },
  {
    name: "no-action-queue-write",
    pattern:
      /(supabase\s*\.\s*from\(\s*["'`]action_queue["'`]\s*\)|insert\s+action_queue|create[_\s-]?action[_\s-]?queue|send[_\s-]?action)/i,
    explanation:
      "Preview must never insert/create Action Queue rows or call action-write paths.",
  },
  {
    name: "no-functions-invoke",
    pattern: /\bfunctions\s*\.\s*invoke\b/,
    explanation:
      "Preview must never invoke Edge Functions (no model/AI call from the preview).",
  },
  {
    name: "no-service-role",
    pattern: /\b(service_role|SUPABASE_SERVICE_ROLE_KEY)\b/,
    explanation:
      "service_role must never appear in preview code paths.",
  },
  {
    name: "no-mqtt-publish",
    pattern: /\bmqtt[\s_-]?publish\b/i,
    explanation:
      "Preview must never publish MQTT / device messages.",
  },
  {
    name: "no-device-command",
    pattern: /\bdevice[\s_-]?commands?\b/i,
    explanation:
      "Preview must never emit device commands.",
  },
  {
    name: "no-turn-on-off",
    pattern: /\bturn[\s_-]?(on|off)\b/i,
    explanation:
      "Preview must never tell equipment to turn on/off.",
  },
  {
    name: "no-pump-on-off",
    pattern: /\bpump[\s_-]?(on|off|start|stop)\b/i,
    explanation:
      "Preview must never command pumps.",
  },
  {
    name: "no-dose",
    pattern: /\bdose\b/i,
    explanation:
      "Preview must never recommend dosing.",
  },
  {
    name: "no-set-temp-humidity",
    pattern: /\bset[\s_-]?(temp|temperature|humidity|rh|setpoint)\b/i,
    explanation:
      "Preview must never set temperature/humidity setpoints.",
  },
  {
    name: "no-automation-enabled",
    pattern: /\bautomation\s+(enabled|on|active|engaged)\b/i,
    explanation:
      "Preview must never enable automation.",
  },
  {
    name: "no-control-equipment",
    pattern: /\bcontrol(s|ling)?\s+equipment\b/i,
    explanation:
      "Preview must never control equipment.",
  },
];

const DENIAL =
  /\b(never|not|n't|cannot|blocked?|drops?|dropped|prohibit(s|ed)?|prevent(s|ed)?|guard(s|ed)?|refus(e|es|ed)|forbid(s|den)?|defence|defense|safety[-\s]?(filter|posture|note|net|guard))\b/i;

function isCommentLine(trimmed) {
  return (
    trimmed.startsWith("*") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("/**")
  );
}

function isRegexLiteralLine(trimmed) {
  // e.g. `/\bturn_on\b/i,`  or  `/\bexec(ute)?[_\s-]?(command|device)\b/i,`
  if (/^\/\\b/.test(trimmed)) return true;
  // any line whose only "code" is a regex literal in an array of patterns
  return /\/\\b[^/]+\\b\/[a-z]*\s*,?\s*$/.test(trimmed);
}

function hasAllowPhrase(lower) {
  return ALLOW_PHRASES.some((p) => lower.includes(p));
}

export function scanText(text, { isTestFile = false } = {}) {
  if (isTestFile) return [];
  const lines = text.split(/\r?\n/);
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.includes(ALLOW_MARKER)) continue;
    if (isCommentLine(trimmed)) continue;
    if (isRegexLiteralLine(trimmed)) continue;
    const lower = trimmed.toLowerCase();
    if (hasAllowPhrase(lower)) continue;
    if (DENIAL.test(trimmed)) continue;
    for (const rule of RULES) {
      if (rule.pattern.test(trimmed)) {
        violations.push({
          line: i + 1,
          rule: rule.name,
          explanation: rule.explanation,
          text: trimmed,
        });
      }
    }
  }
  return violations;
}

export function formatViolation(file, v) {
  return `${file}:${v.line} [${v.rule}] "${v.text}" — ${v.explanation}`;
}

function main() {
  let failed = 0;
  let scanned = 0;
  for (const rel of SCAN_TARGETS) {
    const abs = join(ROOT, rel);
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch (err) {
      console.error(
        `ai-doctor preview safety: cannot read ${rel} — ${err.message}`,
      );
      failed += 1;
      continue;
    }
    scanned += 1;
    const isTestFile = rel.includes("/test/");
    const violations = scanText(text, { isTestFile });
    if (violations.length) {
      failed += violations.length;
      for (const v of violations) {
        console.error(formatViolation(relative(ROOT, abs), v));
      }
    }
  }
  if (failed) {
    console.error(
      `\nAI Doctor preview safety: ${failed} violation(s) across ${scanned} file(s) scanned.`,
    );
    process.exit(1);
  }
  console.log(
    `AI Doctor preview safety: OK (${scanned} file(s) scanned).`,
  );
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("assert-ai-doctor-preview-safety.mjs");
if (invokedDirectly) main();
