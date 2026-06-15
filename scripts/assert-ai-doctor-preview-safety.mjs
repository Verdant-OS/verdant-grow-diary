#!/usr/bin/env node
/**
 * Verdant AI Doctor Action Queue Suggestion Preview — Safety Scanner
 * ------------------------------------------------------------------
 * Dependency-free static check that scans the preview helper + presenter
 * (and any future preview-related files) for unsafe executable /
 * write-path language. Keeps the read-only preview from drifting into
 * an Action Queue write, automation, or device-control feature.
 *
 * Always scans:
 *   - src/lib/aiDoctorActionSuggestionPreviewRules.ts
 *   - src/components/AiDoctorContextReadinessPanel.tsx
 *
 * Additionally scans any `.ts` / `.tsx` file under `src/lib/**` or
 * `src/components/**` whose content contains a preview-identifying
 * marker (see PREVIEW_IDENTIFIER_MARKERS). Unrelated files are ignored.
 *
 * Allowlist:
 *   scripts/config/ai-doctor-preview-safety-allowlist.json
 *   Required JSON shape:
 *     { "allowedPhrases": string[], "allowedLineMarkers": string[] }
 *   The scanner fails closed if the file is missing or malformed.
 *
 * Each violation prints structured output:
 *   <file>:<line> [<rule>] "<text>" — <explanation>
 *
 * When running in GitHub Actions (GITHUB_ACTIONS === "true") the scanner
 * also emits workflow annotations:
 *   ::error file=<file>,line=<line>,title=<rule>::<escaped message>
 *
 * Usage:
 *   node scripts/assert-ai-doctor-preview-safety.mjs
 *
 * Exit codes:
 *   0 — no violations
 *   1 — one or more violations OR allowlist load failure
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
export const DEFAULT_ALLOWLIST_PATH = join(
  "scripts",
  "config",
  "ai-doctor-preview-safety-allowlist.json",
);

export const KNOWN_TARGETS = Object.freeze([
  "src/lib/aiDoctorActionSuggestionPreviewRules.ts",
  "src/components/AiDoctorContextReadinessPanel.tsx",
]);

export const DISCOVERY_ROOTS = Object.freeze(["src/lib", "src/components"]);

/**
 * Content markers that identify a file as part of the AI Doctor Action
 * Queue suggestion preview surface. A future file must contain at least
 * one of these to be auto-included.
 */
export const PREVIEW_IDENTIFIER_MARKERS = Object.freeze([
  "Action Queue suggestion preview",
  "ActionSuggestionPreview",
  "previewActionSuggestion",
  "aiDoctorActionSuggestionPreview",
  "ai-doctor-action-suggestion-preview",
]);

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
    explanation: "Preview must never publish MQTT / device messages.",
  },
  {
    name: "no-device-command",
    pattern: /\bdevice[\s_-]?commands?\b/i,
    explanation: "Preview must never emit device commands.",
  },
  {
    name: "no-turn-on-off",
    pattern: /\bturn[\s_-]?(on|off)\b/i,
    explanation: "Preview must never tell equipment to turn on/off.",
  },
  {
    name: "no-pump-on-off",
    pattern: /\bpump[\s_-]?(on|off|start|stop)\b/i,
    explanation: "Preview must never command pumps.",
  },
  {
    name: "no-dose",
    pattern: /\bdose\b/i,
    explanation: "Preview must never recommend dosing.",
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
    explanation: "Preview must never enable automation.",
  },
  {
    name: "no-control-equipment",
    pattern: /\bcontrol(s|ling)?\s+equipment\b/i,
    explanation: "Preview must never control equipment.",
  },
];

const DENIAL =
  /\b(never|not|n't|cannot|blocked?|drops?|dropped|prohibit(s|ed)?|prevent(s|ed)?|guard(s|ed)?|refus(e|es|ed)|forbid(s|den)?|defence|defense|safety[-\s]?(filter|posture|note|net|guard))\b/i;

// ─── Allowlist config ─────────────────────────────────────────────────

export class AllowlistConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "AllowlistConfigError";
  }
}

/**
 * Load and validate the allowlist config. Fails closed: missing file,
 * unreadable file, invalid JSON, wrong shape, or non-string entries all
 * throw AllowlistConfigError.
 */
export function loadAllowlist(configPath = DEFAULT_ALLOWLIST_PATH) {
  const abs = configPath.startsWith("/") ? configPath : join(ROOT, configPath);
  let raw;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (err) {
    throw new AllowlistConfigError(
      `Allowlist config not found or unreadable at ${configPath}: ${err.message}`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new AllowlistConfigError(
      `Allowlist config is not valid JSON (${configPath}): ${err.message}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AllowlistConfigError(
      `Allowlist config must be a JSON object (${configPath}).`,
    );
  }
  const { allowedPhrases, allowedLineMarkers } = parsed;
  if (!Array.isArray(allowedPhrases) || !Array.isArray(allowedLineMarkers)) {
    throw new AllowlistConfigError(
      `Allowlist config must contain string arrays "allowedPhrases" and "allowedLineMarkers" (${configPath}).`,
    );
  }
  for (const v of allowedPhrases) {
    if (typeof v !== "string" || v.length === 0) {
      throw new AllowlistConfigError(
        `allowedPhrases must contain non-empty strings (${configPath}).`,
      );
    }
  }
  for (const v of allowedLineMarkers) {
    if (typeof v !== "string" || v.length === 0) {
      throw new AllowlistConfigError(
        `allowedLineMarkers must contain non-empty strings (${configPath}).`,
      );
    }
  }
  return Object.freeze({
    allowedPhrases: Object.freeze([...allowedPhrases]),
    allowedLineMarkers: Object.freeze([...allowedLineMarkers]),
  });
}

// ─── Scan helpers ─────────────────────────────────────────────────────

function isCommentLine(trimmed) {
  return (
    trimmed.startsWith("*") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("/**")
  );
}

function isRegexLiteralLine(trimmed) {
  if (/^\/\\b/.test(trimmed)) return true;
  return /\/\\b[^/]+\\b\/[a-z]*\s*,?\s*$/.test(trimmed);
}

export function scanText(
  text,
  {
    isTestFile = false,
    allowedPhrases = [],
    allowedLineMarkers = [],
  } = {},
) {
  if (isTestFile) return [];
  const lowerPhrases = allowedPhrases.map((p) => p.toLowerCase());
  const lines = text.split(/\r?\n/);
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (allowedLineMarkers.some((m) => trimmed.includes(m))) continue;
    if (isCommentLine(trimmed)) continue;
    if (isRegexLiteralLine(trimmed)) continue;
    const lower = trimmed.toLowerCase();
    if (lowerPhrases.some((p) => lower.includes(p))) continue;
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

/**
 * Escape a string for safe use inside a GitHub Actions workflow command.
 * See: https://docs.github.com/actions/using-workflows/workflow-commands-for-github-actions
 */
export function escapeAnnotation(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

export function formatAnnotation(file, v) {
  const message = escapeAnnotation(`${v.explanation} — matched: ${v.text}`);
  const title = escapeAnnotation(v.rule);
  const safeFile = escapeAnnotation(file);
  return `::error file=${safeFile},line=${v.line},title=${title}::${message}`;
}

// ─── Target discovery ─────────────────────────────────────────────────

function fileMatchesPreviewMarker(absPath) {
  let text;
  try {
    text = readFileSync(absPath, "utf8");
  } catch {
    return false;
  }
  return PREVIEW_IDENTIFIER_MARKERS.some((m) => text.includes(m));
}

function walkSourceTree(dir, out = []) {
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
      walkSourceTree(p, out);
    } else if (st.isFile() && (name.endsWith(".ts") || name.endsWith(".tsx"))) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Discover all preview-related files relative to the given root.
 * Always includes KNOWN_TARGETS (even if missing — they are scanned and
 * reported as missing). Additionally includes any .ts/.tsx file under
 * DISCOVERY_ROOTS whose content matches a PREVIEW_IDENTIFIER_MARKER.
 * Test files under any `/test/` segment are excluded from discovery.
 */
export function discoverTargets(rootDir = ROOT) {
  const out = new Set();
  for (const rel of KNOWN_TARGETS) out.add(rel.split("/").join(sep));
  for (const rel of DISCOVERY_ROOTS) {
    const absRoot = join(rootDir, rel);
    const files = walkSourceTree(absRoot);
    for (const abs of files) {
      const relPath = relative(rootDir, abs);
      if (relPath.split(sep).includes("test")) continue;
      if (relPath.split(sep).includes("__tests__")) continue;
      if (fileMatchesPreviewMarker(abs)) out.add(relPath);
    }
  }
  // Normalise to forward-slash for stable output across platforms.
  return [...out].map((p) => p.split(sep).join("/")).sort();
}

// ─── Main ─────────────────────────────────────────────────────────────

function main() {
  let allowlist;
  try {
    allowlist = loadAllowlist();
  } catch (err) {
    console.error(`ai-doctor preview safety: ${err.message}`);
    process.exit(1);
  }

  const ghActions = process.env.GITHUB_ACTIONS === "true";
  const targets = discoverTargets(ROOT);
  let failed = 0;
  let scanned = 0;

  for (const rel of targets) {
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
    const violations = scanText(text, {
      isTestFile,
      allowedPhrases: allowlist.allowedPhrases,
      allowedLineMarkers: allowlist.allowedLineMarkers,
    });
    if (violations.length) {
      failed += violations.length;
      for (const v of violations) {
        console.error(formatViolation(rel, v));
        if (ghActions) console.error(formatAnnotation(rel, v));
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
