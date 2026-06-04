#!/usr/bin/env node
/**
 * Verdant Sensor Intelligence Safety Scanner
 * ------------------------------------------
 * Defensive static scanner that fails if any source file reintroduces
 * unsafe patterns around the V0 sensor-intelligence safety contract.
 *
 * This scanner adds NO features. It only refuses to let unsafe patterns
 * land. It enforces:
 *
 *   1. Frontend (src/, non-test) must not reference `service_role`,
 *      `SUPABASE_SERVICE_ROLE_KEY`, raw bridge tokens, or other private env.
 *   2. Drift- or AI-Doctor-only logic must not auto-insert into
 *      `action_queue` (Action Queue items require explicit grower approval).
 *   3. Scheduled-analysis code must not create rows whose status is
 *      `approved`, `applied`, or `executed`.
 *   4. Device-control payload terms (`execute_device`, `setpoint_write`,
 *      `irrigation_control`, `light_control`, `fan_control`) must not
 *      appear in shipped code.
 *   5. Peer-distribution surfaces must not synthesize fake fallback data
 *      (no `Math.random`, no `mockPeerDistribution`, no `// fake` markers).
 *   6. Reserved future-subsystem names (scheduled-plant-analysis,
 *      sensor_calibrations, CalibrationApprovalCard, unified_plant_analysis,
 *      detect_sensor_outliers, suggest_peer_calibration,
 *      statistical_process_control) may only appear in files that also
 *      include the literal safety-contract marker:
 *        SAFETY-CONTRACT: APPROVAL-REQUIRED
 *
 * Usage:
 *   node scripts/assert-sensor-intelligence-safety.mjs           # scan repo
 *   node scripts/assert-sensor-intelligence-safety.mjs --quiet   # only on fail
 *
 * Exit codes:
 *   0 — no violations
 *   1 — one or more violations
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export const SAFETY_CONTRACT_MARKER = "SAFETY-CONTRACT: APPROVAL-REQUIRED";

export const RESERVED_SUBSYSTEMS = [
  "scheduled-plant-analysis",
  "sensor_calibrations",
  "CalibrationApprovalCard",
  "unified_plant_analysis",
  "detect_sensor_outliers",
  "suggest_peer_calibration",
  "statistical_process_control",
];

export const DEVICE_CONTROL_TERMS = [
  "execute_device",
  "setpoint_write",
  "irrigation_control",
  "light_control",
  "fan_control",
];

const FRONTEND_PRIVATE_TERMS = [
  "service_role",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "BRIDGE_TOKEN_SECRET",
];

const SCHEDULED_STATUS_PATTERNS = [
  /status\s*:\s*["']approved["']/,
  /status\s*:\s*["']applied["']/,
  /status\s*:\s*["']executed["']/,
];

const AUTO_ACTION_QUEUE_INSERT =
  /\.from\(\s*["']action_queue["']\s*\)\s*\.insert\s*\(/;

/**
 * Patterns that indicate *automatic* (non-grower-initiated) execution
 * paths. Manual user-approval flows (e.g. a hook called from a click
 * handler) are explicitly allowed.
 */
const AUTOMATION_HINTS = [
  /autopilot/i,
  /auto[_-]?evaluate/i,
  /driftEvaluator/i,
  /driftAutopilot/i,
  /scheduled[_-]?(plant[_-]?)?analysis/i,
  /\bsetInterval\s*\(/,
  /\bcron\b/i,
];

const FAKE_PEER_PATTERNS = [
  /mockPeerDistribution/i,
  /fakePeerDistribution/i,
  /\/\/\s*fake\s+peer/i,
  /peer[_\s-]?distribution[^\n]{0,200}Math\.random/i,
];

const PEER_DISTRIBUTION_HINT = /peer[_\s-]?distribution/i;
const SCHEDULED_ANALYSIS_HINT = /scheduled[_-]?(plant[_-]?)?analysis/i;

/**
 * Strip // line comments and /* block * / comments so safety notes like
 * `// no service_role usage` do not trigger frontend-private-term hits.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Scan a single file's content. Returns a list of violation objects.
 * Pure — no I/O. Callable from tests with synthetic input.
 */
export function scanContent(relPath, content) {
  const violations = [];
  const isFrontend =
    relPath.startsWith(`src${sep}`) || relPath.startsWith("src/");
  const isTestFile =
    /[\\/](test|tests|__tests__|fixtures)[\\/]/.test(relPath) ||
    /\.test\.(t|j)sx?$/.test(relPath) ||
    /\.spec\.(t|j)sx?$/.test(relPath);
  const isThisScanner =
    relPath.endsWith("assert-sensor-intelligence-safety.mjs") ||
    relPath.endsWith("sensor-intelligence-safety.test.ts");
  const hasContractMarker = content.includes(SAFETY_CONTRACT_MARKER);
  const codeOnly = stripComments(content);

  if (isThisScanner) return violations;

  // 1. Frontend private terms — check only non-comment code.
  if (isFrontend && !isTestFile) {
    for (const term of FRONTEND_PRIVATE_TERMS) {
      if (codeOnly.includes(term)) {
        violations.push({
          rule: "frontend-private-term",
          term,
          message: `Frontend file ${relPath} references private/server-only term \`${term}\`.`,
        });
      }
    }
  }

  // 2. Device-control payload terms — check non-comment code only.
  if (!isTestFile) {
    for (const term of DEVICE_CONTROL_TERMS) {
      if (codeOnly.includes(term)) {
        violations.push({
          rule: "device-control-term",
          term,
          message: `${relPath} contains device-control term \`${term}\`. Verdant V0 forbids device-control payloads.`,
        });
      }
    }
  }

  // 3. Reserved future-subsystem names require the safety contract marker.
  for (const name of RESERVED_SUBSYSTEMS) {
    if (codeOnly.includes(name) && !hasContractMarker && !isTestFile) {
      violations.push({
        rule: "reserved-subsystem-without-contract",
        term: name,
        message: `${relPath} references reserved subsystem \`${name}\` without the literal marker \`${SAFETY_CONTRACT_MARKER}\`.`,
      });
    }
  }

  // 4. Automatic action_queue inserts are forbidden. Grower-initiated
  //    approval flows are fine — flag only when an automation hint
  //    (autopilot, scheduled, setInterval, cron, driftEvaluator…) is
  //    present in the same file as the insert.
  if (AUTO_ACTION_QUEUE_INSERT.test(codeOnly) && !isTestFile) {
    const isAutomated =
      AUTOMATION_HINTS.some((p) => p.test(relPath)) ||
      AUTOMATION_HINTS.some((p) => p.test(codeOnly));
    if (isAutomated) {
      violations.push({
        rule: "auto-action-queue-insert-from-drift-or-ai-doctor",
        message: `${relPath} appears to auto-insert into action_queue from automated/drift logic. Action Queue items must be grower-approved.`,
      });
    }
  }

  // 5. Scheduled-analysis status sentinel — never approved/applied/executed.
  if (SCHEDULED_ANALYSIS_HINT.test(relPath) || SCHEDULED_ANALYSIS_HINT.test(codeOnly)) {
    for (const pat of SCHEDULED_STATUS_PATTERNS) {
      if (pat.test(codeOnly) && !isTestFile) {
        violations.push({
          rule: "scheduled-analysis-unsafe-status",
          message: `${relPath} sets a non-suggested status (approved/applied/executed) in scheduled-analysis code path.`,
        });
        break;
      }
    }
  }

  // 6. Fake peer-distribution fallback data.
  if (PEER_DISTRIBUTION_HINT.test(codeOnly) && !isTestFile) {
    for (const pat of FAKE_PEER_PATTERNS) {
      if (pat.test(codeOnly)) {
        violations.push({
          rule: "fake-peer-distribution-fallback",
          message: `${relPath} appears to synthesize fake peer-distribution data. Demo/fake data must never be displayed as live.`,
        });
        break;
      }
    }
  }

  return violations;
}

const DEFAULT_SCAN_DIRS = ["src", "scripts", "supabase", ".github"];
const SCAN_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".sql",
  ".yml",
  ".yaml",
]);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  "fixtures", // fixtures intentionally contain unsafe samples for tests
]);

function* walk(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      yield* walk(full);
    } else if (s.isFile()) {
      const dot = entry.lastIndexOf(".");
      const ext = dot >= 0 ? entry.slice(dot) : "";
      if (SCAN_EXTS.has(ext)) yield full;
    }
  }
}

export function scanRepository(root = process.cwd(), dirs = DEFAULT_SCAN_DIRS) {
  const violations = [];
  for (const d of dirs) {
    const abs = resolve(root, d);
    for (const file of walk(abs)) {
      const rel = relative(root, file);
      let content;
      try {
        content = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      violations.push(...scanContent(rel, content));
    }
  }
  return violations;
}

// CLI
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("assert-sensor-intelligence-safety.mjs");
if (isMain) {
  const quiet = process.argv.includes("--quiet");
  const v = scanRepository();
  if (v.length === 0) {
    if (!quiet) {
      // eslint-disable-next-line no-console
      console.log("✓ sensor-intelligence safety scan: 0 violations");
    }
    process.exit(0);
  }
  // eslint-disable-next-line no-console
  console.error(
    `✗ sensor-intelligence safety scan: ${v.length} violation(s)`,
  );
  for (const item of v) {
    // eslint-disable-next-line no-console
    console.error(`  - [${item.rule}] ${item.message}`);
  }
  process.exit(1);
}
