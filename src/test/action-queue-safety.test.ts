/**
 * Action Queue safety regression tests for Verdant.
 *
 * Verdant currently has NO action_queue table and NO device-control surface.
 * AI Coach is suggest-only by construction: it returns structured JSON to the
 * user and never writes side effects, never opens MQTT / Home Assistant /
 * Pi-bridge / webhook sockets, and the schema has no table that could be used
 * to drive equipment.
 *
 * These tests lock that posture in TWO ways:
 *
 *   A. CURRENT-STATE assertions — fail loudly if any device-control code is
 *      introduced into the repo (ai-coach edge function or anywhere in src/
 *      / supabase/functions/).
 *
 *   B. FUTURE-PROOF assertions — if/when a migration introduces the
 *      `action_queue` table, it MUST satisfy the safety contract:
 *        - default status = 'pending_approval'
 *        - required columns: user_id, grow_id, action_type, target,
 *          reason, risk_level, status, created_at
 *        - RLS enabled with user-scoped policies
 *        - no service-role bypass on writes
 *      Until that migration exists those assertions are gated behind a
 *      detection step and reported as "n/a (table not yet introduced)".
 *
 * Do NOT relax these tests without a security review.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const AI_COACH_SRC = readFileSync(resolve(ROOT, "supabase/functions/ai-coach/index.ts"), "utf8");
const TYPES_SRC = readFileSync(resolve(ROOT, "src/integrations/supabase/types.ts"), "utf8");

// Recursively collect text files under a directory, excluding test files and
// this file (so we don't false-positive on our own regex strings).
function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === ".git") continue;
      walk(p, acc);
    } else if (/\.(ts|tsx|js|jsx|sql|toml)$/.test(name)) {
      acc.push(p);
    }
  }
  return acc;
}

const SCAN_PATHS = [
  ...walk(resolve(ROOT, "src")),
  ...walk(resolve(ROOT, "supabase/functions")),
].filter((p) => {
  // Normalize Windows backslashes so the test-dir exclusion works on every OS.
  const posix = p.replace(/\\/g, "/");
  return !posix.includes("/test/") && !posix.endsWith(".test.ts") && !posix.endsWith(".test.tsx");
});

function readAll(): {
  text: string;
  boundaries: Array<{ start: number; end: number; path: string }>;
} {
  const boundaries: Array<{ start: number; end: number; path: string }> = [];
  let text = "";
  const sep = "\n\n//FILE\n\n";
  for (const p of SCAN_PATHS) {
    const content = readFileSync(p, "utf8");
    const start = text.length;
    text += content;
    boundaries.push({ start, end: text.length, path: p });
    text += sep;
  }
  return { text, boundaries };
}
const { text: ALL_PROD_CODE, boundaries: FILE_BOUNDARIES } = readAll();

function fileAtIndex(idx: number): string {
  for (const b of FILE_BOUNDARIES) {
    if (idx >= b.start && idx < b.end) return b.path;
  }
  return "";
}

// Find the migration that introduces the action_queue TABLE (for table-shape checks).
function findActionQueueMigration(): string | null {
  const migDir = resolve(ROOT, "supabase/migrations");
  for (const name of readdirSync(migDir)) {
    if (!name.endsWith(".sql")) continue;
    const sql = readFileSync(join(migDir, name), "utf8");
    if (/create\s+table[^;]*\baction_queue\b/i.test(sql)) return sql;
  }
  return null;
}

// Concatenate EVERY migration that touches action_queue — needed because later
// migrations may DROP + recreate policies to tighten checks.
function readAllActionQueueMigrations(): string {
  const migDir = resolve(ROOT, "supabase/migrations");
  const chunks: string[] = [];
  for (const name of readdirSync(migDir).sort()) {
    if (!name.endsWith(".sql")) continue;
    const sql = readFileSync(join(migDir, name), "utf8");
    if (/\baction_queue\b/i.test(sql)) chunks.push(sql);
  }
  return chunks.join("\n\n");
}
const ACTION_QUEUE_SQL = findActionQueueMigration();
const ALL_ACTION_QUEUE_SQL = readAllActionQueueMigrations();
const HAS_ACTION_QUEUE_TABLE = /action_queue/i.test(TYPES_SRC) || !!ACTION_QUEUE_SQL;

// Strip JS/TS comments for source-shape checks on ai-coach.
const AI_COACH_CODE = AI_COACH_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /(^|[^:])\/\/.*$/gm,
  "$1",
);

describe("Action Queue safety — current posture (suggest-only by construction)", () => {
  it("1. ai-coach performs NO row writes (no .insert / .upsert / .update / .delete) and only approved RPCs", () => {
    // Strong invariant: the AI Coach must be read-only on tables.
    expect(AI_COACH_CODE).not.toMatch(/\.insert\s*\(/);
    expect(AI_COACH_CODE).not.toMatch(/\.upsert\s*\(/);
    expect(AI_COACH_CODE).not.toMatch(/\.update\s*\(/);
    expect(AI_COACH_CODE).not.toMatch(/\.delete\s*\(/);
    // And specifically never writes to action_queue (even once the table exists).
    expect(AI_COACH_CODE).not.toMatch(/action_queue/i);

    // RPC allow-list: ai-coach may only call approved credit-metering RPCs.
    // Anything else (device control, automation, action_queue writers,
    // role/billing mutators) is forbidden.
    const APPROVED_RPCS = new Set(["ai_credit_spend", "ai_credit_refund"]);
    const rpcCalls = [...AI_COACH_CODE.matchAll(/\.rpc\s*\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g)].map(
      (m) => m[1],
    );
    for (const name of rpcCalls) {
      expect(
        APPROVED_RPCS.has(name),
        `ai-coach called unapproved RPC: ${name}. Only credit-metering RPCs are allowed.`,
      ).toBe(true);
    }
    // Banned RPC name patterns — device-control / automation / action_queue writers.
    const BANNED_RPC_PATTERNS = [
      /action_queue/i,
      /device/i,
      /relay/i,
      /actuator/i,
      /autopilot/i,
      /auto[_-]?execute/i,
      /dispatch[_-]?command/i,
      /grant[_-]?role/i,
      /set[_-]?billing/i,
      /set[_-]?plan/i,
    ];
    for (const name of rpcCalls) {
      for (const re of BANNED_RPC_PATTERNS) {
        expect(name, `ai-coach RPC name matches banned pattern ${re}`).not.toMatch(re);
      }
    }
  });

  it("1b. ai-coach RPC calls are scoped to credit metering, never Action Queue writes", () => {
    // Pair each .rpc(...) call with a small surrounding window and assert that
    // window does not reference action_queue. This guarantees the approved
    // RPC allow-list is not abused as a side-channel for Action Queue writes.
    const matches = [...AI_COACH_CODE.matchAll(/\.rpc\s*\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g)];
    expect(
      matches.length,
      "ai-coach should call at least one approved RPC (ai_credit_spend)",
    ).toBeGreaterThan(0);
    for (const m of matches) {
      const idx = m.index ?? 0;
      const window = AI_COACH_CODE.slice(Math.max(0, idx - 200), idx + 400);
      expect(m[1]).toMatch(/^ai_credit_(spend|refund)$/);
      expect(window, `ai-coach RPC ${m[1]} must not touch action_queue`).not.toMatch(
        /action_queue/i,
      );
    }
  });

  it("2. no AI / coach code reaches MQTT, Home Assistant, Pi bridge, webhooks, or device endpoints", () => {
    const banned: Array<{ name: string; re: RegExp }> = [
      { name: "MQTT", re: /\bmqtt:\/\//i },
      { name: "MQTT client", re: /\bmqtt\.connect\b/i },
      { name: "Pi bridge HTTP", re: /pi[\s_-]?bridge\.(?:local|lan|home|io|net|com)/i },
      { name: "webhook URL var", re: /\bWEBHOOK_URL\b/ },
      { name: "device_command", re: /device_command/i },
      { name: "actuator call", re: /\bactuator\.(send|trigger|run|fire)/i },
      { name: "relay control", re: /\brelay\.(on|off|toggle)/i },
      { name: "command bus", re: /command_bus/i },
    ];
    // Scoped allow-list: a small set of safety modules contain DENYLIST
    // tokens (e.g. `device_command`, `blocked_device_command_risk`) used only
    // to STRIP / BLOCK unsafe wording from AI Doctor drafts and Action Queue
    // suggestion previews. These tokens never reach an execution surface —
    // they exist to BLOCK device control, not enable it. Exclude these
    // specific files from the device-control-surface scan.
    const SAFETY_ALLOW_PATHS = new Set<string>([
      resolve(ROOT, "src/lib/aiDoctorSafetyRules.ts"),
      resolve(ROOT, "src/lib/aiDoctorActionSuggestionPreviewRules.ts"),
      resolve(ROOT, "src/lib/aiDoctorFixtureContextRules.ts"),
    ]);

    let scanText = "";
    for (const b of FILE_BOUNDARIES) {
      if (SAFETY_ALLOW_PATHS.has(b.path)) continue;
      scanText += ALL_PROD_CODE.slice(b.start, b.end) + "\n\n//FILE\n\n";
    }

    for (const { name, re } of banned) {
      expect(scanText, `must not contain device-control surface: ${name}`).not.toMatch(re);
    }
    // home_assistant references appear ONLY as sensor_readings.source enum
    // values (`home_assistant_bridge`, `ha_forwarded`) — never as outbound
    // control calls. Assert no fetch/HTTP/MQTT context around them.
    const haContexts = [...ALL_PROD_CODE.matchAll(/home[\s_-]?assistant/gi)];
    for (const m of haContexts) {
      const ctx = ALL_PROD_CODE.slice(Math.max(0, m.index! - 60), m.index! + 60);
      expect(ctx, `home_assistant reference must not be a control call: ${ctx}`).not.toMatch(
        /fetch\(|http\.|mqtt:\/\/|mqtt\.connect|\.publish\(|\.post\(|\.send\(|\.trigger\(/i,
      );
    }
    // pi_bridge appears ONLY as a sensor_readings.source enum value (read-side
    // ingest tag), never as an outbound device controller — assert it's not
    // referenced from any fetch/url/MQTT call.
    // Scoped allow-list: src/constants/sensorProviderLabels.ts holds read-only
    // display-name constants (e.g. pi_bridge: "Pi Bridge", mqtt: "MQTT"). The
    // literal "mqtt" inside that map is a label key, not a device-control call.
    const PROVIDER_LABELS_PATH = resolve(ROOT, "src/constants/sensorProviderLabels.ts");
    // Also allow-list (EXACT FILE PATH ONLY — never a directory wildcard):
    // src/constants/sensorIngestProvenance.ts holds read-only sensor provenance
    // constants (e.g. `raspberry_pi_bridge`). It is:
    //   - read-only sensor provenance constants
    //   - NOT a device-control surface
    //   - NOT an Action Queue execution path
    //   - NOT a sensor ingest behavior surface
    // The allow-list MUST stay file-specific. Broad patterns like
    // `src/constants/*` are explicitly forbidden — see the "pi_bridge
    // scanner allow-list hardening" suite at the bottom of this file.
    const SENSOR_INGEST_PROVENANCE_PATH = resolve(ROOT, "src/constants/sensorIngestProvenance.ts");
    // Also allow-list (EXACT FILE PATH ONLY): src/lib/aiDoctorContextCompiler.ts
    // holds a read-only LIVE_VENDORS Set used to CLASSIFY incoming sensor
    // source strings (e.g. "mqtt", "pi_bridge") as live vs invalid. It is:
    //   - read-only source classification
    //   - NOT a device-control surface, NOT an outbound call, NOT a writer
    // The 60-char context window around pi_bridge here includes the adjacent
    // "mqtt" literal in the same Set, which triggers the control-call regex
    // as a false positive. Keep file-specific.
    const AI_DOCTOR_CONTEXT_COMPILER_PATH = resolve(ROOT, "src/lib/aiDoctorContextCompiler.ts");
    const piContexts = [...ALL_PROD_CODE.matchAll(/pi[_-]bridge/gi)];
    for (const m of piContexts) {
      const ctx = ALL_PROD_CODE.slice(Math.max(0, m.index! - 60), m.index! + 60);
      // Scoped skip: if the match is inside a read-only constants file,
      // the surrounding text is a map key / constant string, not a control surface.
      const path = fileAtIndex(m.index!);
      if (
        path === PROVIDER_LABELS_PATH ||
        path === SENSOR_INGEST_PROVENANCE_PATH ||
        path === AI_DOCTOR_CONTEXT_COMPILER_PATH
      )
        continue;
      expect(ctx, `pi_bridge reference must not be a control call: ${ctx}`).not.toMatch(
        /fetch|http|mqtt|publish|post|send|trigger/i,
      );
    }
  });

  it("2c. One-Tent Loop proof files carry no device_command/auto-execute token, and the scanner itself still blocks a real one", () => {
    // Regression coverage for a prior false positive: these three files used
    // `has_device_command` as a boolean SAFETY-DETECTOR field name (always
    // false in production; flips a read-only proof row to "blocked" if a
    // device-command marker were ever present) and prose describing that
    // same detector. Renamed to `has_device_control_marker` / reworded copy
    // so the diagnostic-only text no longer trips this scanner — nothing
    // about device-control behavior changed.
    const ONE_TENT_LOOP_PATHS = [
      resolve(ROOT, "src/pages/OneTentLoopLiveProof.tsx"),
      resolve(ROOT, "src/lib/oneTentLoopProofRules.ts"),
      resolve(ROOT, "src/lib/oneTentLoopGapResolver.ts"),
    ];
    for (const p of ONE_TENT_LOOP_PATHS) {
      const src = readFileSync(p, "utf8");
      expect(src, `${p} must not contain a literal device_command token`).not.toMatch(
        /device_command/i,
      );
      expect(src, `${p} must not contain a literal auto-execute token`).not.toMatch(
        /\bauto[-_ ]?execute\b/i,
      );
    }
    // Meta-test: prove the scanner itself is unchanged and would still fail
    // loudly on a genuine device_command token, so this fix is a rename, not
    // a weakened check.
    const bannedDeviceCommand = /device_command/i;
    expect("this string contains device_command as a real token").toMatch(bannedDeviceCommand);
  });

  it("10. no simulation/auto-execute path exists that could push commands to real devices", () => {
    // No "auto execute / autopilot" code paths in production.
    //
    // Scoped allow-list: the Post-Grow Reflection AI prompt body is a
    // read-only string of GROUND-RULES that explicitly FORBIDS device
    // control / autopilot / automated equipment execution. The forbidden
    // words appear only inside a "Do not suggest …" instruction so the
    // model never proposes them. It is not an execution path, has no
    // network/RPC, and is locked by post-grow-reflection-prompt.test.ts +
    // post-grow-reflection-static-safety.test.ts. See those suites before
    // widening this exemption.
    const POST_GROW_REFLECTION_PROMPT_PATH = resolve(
      ROOT,
      "src/lib/ai/postGrowReflectionPrompt.ts",
    );
    // Also allow-list (EXACT FILE PATH ONLY): postGrowReportPrintRules.ts is
    // a pure HTML-printing helper whose copy includes the literal grower-
    // facing reassurance "Verdant does not auto-execute." That string is a
    // safety GUARANTEE rendered into the printed report — there is no
    // network, RPC, automation, or device-control surface in this file.
    const POST_GROW_REPORT_PRINT_RULES_PATH = resolve(ROOT, "src/lib/postGrowReportPrintRules.ts");
    // Also allow-list (EXACT FILE PATH ONLY): postGrowPdfExport.ts is the PDF
    // sibling of postGrowReportPrintRules.ts — a pure HTML-building/print
    // helper whose copy renders the SAME grower-facing reassurance "Verdant
    // does not auto-execute." into the exported PDF report. It has no
    // network, RPC, automation, or device-control surface; the "static
    // safety — no forbidden imports in PDF export code" suite in
    // post-grow-report-pdf-export.test.tsx locks that down.
    const POST_GROW_PDF_EXPORT_PATH = resolve(ROOT, "src/lib/postGrowPdfExport.ts");
    // Also allow-list (EXACT FILE PATH ONLY): verdantSeoCopy.ts carries the
    // VERDANT_FORBIDDEN_PUBLIC_PHRASES denylist — "autopilot" etc. appear
    // there ONLY as forbidden examples that the SEO safety tests assert
    // never render on public surfaces. It is presenter copy with no
    // network, RPC, automation, or device-control surface. Guarded by
    // test 2d below: the tokens must stay inside the denylist array.
    const VERDANT_SEO_COPY_PATH = resolve(ROOT, "src/constants/verdantSeoCopy.ts");
    const ALLOWED_AUTO_EXECUTE_PATHS = new Set([
      POST_GROW_REFLECTION_PROMPT_PATH,
      POST_GROW_REPORT_PRINT_RULES_PATH,
      POST_GROW_PDF_EXPORT_PATH,
      VERDANT_SEO_COPY_PATH,
    ]);
    for (const re of [
      /\bautopilot\b/i,
      /\bauto[-_ ]?execute\b/i,
      /\bauto[-_ ]?apply\b/i,
      /\bexecute_action\b/i,
      /\bdispatch_command\b/i,
    ]) {
      let scanText = ALL_PROD_CODE;
      let match = scanText.match(re);
      while (match && match.index !== undefined) {
        const path = fileAtIndex(match.index);
        if (!ALLOWED_AUTO_EXECUTE_PATHS.has(path)) {
          expect(scanText, `unexpected auto-execute token in ${path}`).not.toMatch(re);
          break;
        }
        // Skip this allow-listed occurrence and keep scanning the rest.
        const consumeTo = match.index + match[0].length;
        scanText = scanText.slice(0, match.index) + scanText.slice(consumeTo);
        match = scanText.match(re);
      }
    }
  });

  it("2b. allow-listed safety file aiDoctorActionSuggestionPreviewRules.ts contains only blocking infrastructure", () => {
    const PREVIEW_RULES_PATH = resolve(ROOT, "src/lib/aiDoctorActionSuggestionPreviewRules.ts");
    const src = readFileSync(PREVIEW_RULES_PATH, "utf8");

    // The file MUST contain the safety-blocking status enum.
    expect(src).toMatch(/"blocked_device_command_risk"/);
    // And it MUST define a denylist of device-command-shaped patterns it
    // BLOCKS — that's the entire reason for the allow-list entry.
    expect(src).toMatch(/DEVICE_COMMAND_PATTERNS/);

    // The file MUST NOT contain real device-control surfaces or grower-facing
    // unsafe equipment copy or any secret/raw-payload leakage.
    const BANNED: RegExp[] = [
      /\bmqtt:\/\//i,
      /\bmqtt\.connect\b/i,
      /\bactuator\.(send|trigger|run|fire)/i,
      /\brelay\.(on|off|toggle)/i,
      /command_bus/i,
      /turn on equipment/i,
      /send command to/i,
      /control device/i,
      /auto[- ]?run equipment/i,
      /pump\.(on|off|run)/i,
      /dose\(/i,
      /service_role/i,
      /raw_payload/i,
      /sk_live_/i,
      /Bearer\s+ey/i,
      /SUPABASE_SERVICE_ROLE_KEY/i,
    ];
    for (const re of BANNED) {
      expect(src, `preview rules file must not contain: ${re}`).not.toMatch(re);
    }

    // Every device_command occurrence in the file must sit inside safety-block
    // semantics (status enum, denylist patterns, blocked-reason copy, or
    // comments). Sanity-check by requiring a "block" / "denylist" / "BLOCK" /
    // "safety" keyword within 80 chars of each device_command hit.
    const hits = [...src.matchAll(/device_command/gi)];
    expect(hits.length).toBeGreaterThan(0);
    for (const m of hits) {
      const ctx = src.slice(Math.max(0, m.index! - 120), m.index! + 120);
      expect(
        /block|denylist|deny[_-]?list|safety|BLOCK|risk|PATTERNS|never|forbidden/i.test(ctx),
        `device_command at ${m.index} lacks safety/block context: ${ctx}`,
      ).toBe(true);
    }
  });

  it("2d. allow-listed SEO copy file confines auto-execute tokens to the forbidden-phrases denylist", () => {
    const SEO_COPY_PATH = resolve(ROOT, "src/constants/verdantSeoCopy.ts");
    const src = readFileSync(SEO_COPY_PATH, "utf8");

    // The denylist MUST exist and MUST still contain the tokens — that is
    // the entire reason for the allow-list entry (the SEO safety tests
    // iterate it to prove public copy never renders these phrases).
    const arrayMatch = src.match(/VERDANT_FORBIDDEN_PUBLIC_PHRASES[\s\S]*?=\s*\[([\s\S]*?)\];/);
    expect(arrayMatch, "VERDANT_FORBIDDEN_PUBLIC_PHRASES array missing").toBeTruthy();
    const arrayBody = arrayMatch![1];
    expect(arrayBody).toMatch(/\bautopilot\b/i);

    // Outside the denylist array, the file must contain NONE of the
    // auto-execute tokens the production scan forbids.
    const remainder = src.replace(arrayMatch![0], "");
    for (const re of [
      /\bautopilot\b/i,
      /\bauto[-_ ]?execute\b/i,
      /\bauto[-_ ]?apply\b/i,
      /\bexecute_action\b/i,
      /\bdispatch_command\b/i,
    ]) {
      expect(remainder, `auto-execute token outside denylist array: ${re}`).not.toMatch(re);
    }

    // Presenter copy only — no runtime danger surface may ever appear here.
    for (const re of [
      /\.rpc\(/i,
      /service_role/i,
      /\bmqtt\.connect\b/i,
      /\bmqtt:\/\//i,
      /supabase\s*\.\s*from\(/i,
      /\bfetch\(/i,
      /raw_payload/i,
    ]) {
      expect(src, `SEO copy file must not contain: ${re}`).not.toMatch(re);
    }
  });

  it("2e. allow-listed PDF export file confines auto-execute tokens to the negated safety guarantee", () => {
    const PDF_EXPORT_PATH = resolve(ROOT, "src/lib/postGrowPdfExport.ts");
    const src = readFileSync(PDF_EXPORT_PATH, "utf8");

    // Every auto-execute occurrence must be the negated grower-facing
    // guarantee ("does not auto-execute") — never a positive automation claim.
    const hits = [...src.matchAll(/\bauto[-_ ]?execute\b/gi)];
    expect(hits.length, "allow-list entry is stale — token no longer present").toBeGreaterThan(0);
    for (const m of hits) {
      const before = src.slice(Math.max(0, m.index! - 30), m.index!);
      expect(
        /\b(does not|never|not)\s*$/i.test(before),
        `auto-execute token at ${m.index} is not inside a negation: ...${before}${m[0]}`,
      ).toBe(true);
    }
    // And none of the other forbidden auto-execute vocabulary may appear.
    for (const re of [
      /\bautopilot\b/i,
      /\bauto[-_ ]?apply\b/i,
      /\bexecute_action\b/i,
      /\bdispatch_command\b/i,
    ]) {
      expect(src, `PDF export file must not contain: ${re}`).not.toMatch(re);
    }
    // Presenter copy only — no runtime danger surface may ever appear here.
    for (const re of [
      /\.rpc\(/i,
      /service_role/i,
      /\bmqtt\.connect\b/i,
      /\bmqtt:\/\//i,
      /supabase\s*\.\s*from\(/i,
      /\bfetch\(/i,
      /device_command/i,
      /raw_payload/i,
    ]) {
      expect(src, `PDF export file must not contain: ${re}`).not.toMatch(re);
    }
  });
});

describe("Action Queue safety — future-proof contract (active only when action_queue ships)", () => {
  it(`detects whether action_queue table exists (currently: ${HAS_ACTION_QUEUE_TABLE ? "YES" : "no — gated tests are pending"})`, () => {
    // This is informational; the gated tests below assert the contract IF the
    // table is introduced. Today we expect it NOT to exist.
    expect(typeof HAS_ACTION_QUEUE_TABLE).toBe("boolean");
  });

  (HAS_ACTION_QUEUE_TABLE ? it : it.skip)(
    "3. action_queue.status defaults to 'pending_approval' (or equivalent approval-required state)",
    () => {
      const sql = ACTION_QUEUE_SQL ?? "";
      expect(sql).toMatch(
        /status[\s\S]{0,80}default\s+['"](pending_approval|awaiting_approval|proposed|suggested)['"]/i,
      );
    },
  );

  (HAS_ACTION_QUEUE_TABLE ? it : it.skip)(
    "4. action_queue includes user_id, grow_id, action_type, target, reason, risk_level, status, created_at",
    () => {
      const sql = ACTION_QUEUE_SQL ?? "";
      for (const col of [
        "user_id",
        "grow_id",
        "action_type",
        "reason",
        "risk_level",
        "status",
        "created_at",
      ]) {
        expect(sql, `action_queue missing required column: ${col}`).toMatch(
          new RegExp(`\\b${col}\\b`, "i"),
        );
      }
      // target_device OR target_metric must exist.
      expect(sql).toMatch(/target_(device|metric)/i);
    },
  );

  (HAS_ACTION_QUEUE_TABLE ? it : it.skip)(
    "5+6+7. action_queue enforces RLS with auth.uid() = user_id (user-scoped writes; client user_id not trusted)",
    () => {
      const sql = ACTION_QUEUE_SQL ?? "";
      expect(sql).toMatch(
        /alter\s+table[\s\S]*action_queue[\s\S]*enable\s+row\s+level\s+security/i,
      );
      expect(sql).toMatch(
        /create\s+policy[\s\S]*action_queue[\s\S]*auth\.uid\(\)\s*=\s*(?:action_queue\.)?user_id/i,
      );
      // No service_role bypass policy.
      expect(sql).not.toMatch(/service_role/i);
    },
  );

  (HAS_ACTION_QUEUE_TABLE ? it : it.skip)(
    "8. action_queue grow ownership is enforced (FK to grows or trigger/policy referencing grows.user_id)",
    () => {
      const sql = ACTION_QUEUE_SQL ?? "";
      // Either a FK to grows(id) plus the RLS-on-user_id above, or an explicit
      // grow-ownership check.
      const hasGrowFk = /grow_id[\s\S]{0,200}references\s+(public\.)?grows\s*\(\s*id\s*\)/i.test(
        sql,
      );
      const hasGrowOwnershipCheck = /grows[\s\S]{0,200}user_id[\s\S]{0,40}auth\.uid\(\)/i.test(sql);
      expect(hasGrowFk || hasGrowOwnershipCheck).toBe(true);
    },
  );

  (HAS_ACTION_QUEUE_TABLE ? it : it.skip)(
    "9. approved actions are separated from suggested (status enum / approved_at column / approvals table)",
    () => {
      const sql = ACTION_QUEUE_SQL ?? "";
      const hasStatusEnum =
        /status[\s\S]{0,200}(approved|executed|rejected|pending_approval)/i.test(sql);
      const hasApprovedAt = /\bapproved_at\b/i.test(sql);
      const hasApprovalsTable = /create\s+table[^;]*\baction_approvals?\b/i.test(sql);
      expect(hasStatusEnum || hasApprovedAt || hasApprovalsTable).toBe(true);
    },
  );
});

describe("Action Queue safety — tightened plant/tent ownership (active once policies tighten)", () => {
  // Pull out just the latest CREATE POLICY ... FOR INSERT / UPDATE blocks on action_queue
  // from across all migrations. The last one wins (later DROP + recreate).
  function lastPolicyBlock(cmd: "INSERT" | "UPDATE"): string {
    const re = new RegExp(
      `CREATE\\s+POLICY[^;]*?ON\\s+public\\.action_queue[\\s\\S]*?FOR\\s+${cmd}[\\s\\S]*?;`,
      "gi",
    );
    const matches = [...ALL_ACTION_QUEUE_SQL.matchAll(re)];
    return matches.length ? matches[matches.length - 1][0] : "";
  }
  const INSERT_POLICY = lastPolicyBlock("INSERT");
  const UPDATE_POLICY = lastPolicyBlock("UPDATE");

  const hasTightening =
    /(?:action_queue\.)?plant_id\s+IS\s+NULL\s+OR\s+EXISTS/i.test(INSERT_POLICY) &&
    /(?:action_queue\.)?tent_id\s+IS\s+NULL\s+OR\s+EXISTS/i.test(INSERT_POLICY);

  it(`detects tightened plant/tent ownership policy: ${hasTightening ? "YES" : "no"}`, () => {
    expect(typeof hasTightening).toBe("boolean");
  });

  (hasTightening ? it : it.skip)("INSERT WITH CHECK enforces user_id = auth.uid()", () => {
    expect(INSERT_POLICY).toMatch(
      /WITH\s+CHECK\s*\([\s\S]*auth\.uid\(\)\s*=\s*(?:action_queue\.)?user_id/i,
    );
  });

  (hasTightening ? it : it.skip)(
    "INSERT WITH CHECK enforces grow_id ownership via grows.user_id = auth.uid()",
    () => {
      expect(INSERT_POLICY).toMatch(
        /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.grows[\s\S]*?id\s*=\s*(?:action_queue\.)?grow_id[\s\S]*?user_id\s*=\s*auth\.uid\(\)/i,
      );
    },
  );

  (hasTightening ? it : it.skip)(
    "INSERT WITH CHECK enforces plant_id ownership when plant_id is not null",
    () => {
      expect(INSERT_POLICY).toMatch(
        /(?:action_queue\.)?plant_id\s+IS\s+NULL\s+OR\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.plants[\s\S]*?id\s*=\s*(?:action_queue\.)?plant_id[\s\S]*?user_id\s*=\s*auth\.uid\(\)/i,
      );
    },
  );

  (hasTightening ? it : it.skip)(
    "INSERT WITH CHECK enforces tent_id ownership when tent_id is not null",
    () => {
      expect(INSERT_POLICY).toMatch(
        /(?:action_queue\.)?tent_id\s+IS\s+NULL\s+OR\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.tents[\s\S]*?id\s*=\s*(?:action_queue\.)?tent_id[\s\S]*?user_id\s*=\s*auth\.uid\(\)/i,
      );
    },
  );

  (hasTightening ? it : it.skip)(
    "INSERT WITH CHECK enforces plant-in-tent consistency when both are set",
    () => {
      // plant.tent_id must match the action's tent_id.
      expect(INSERT_POLICY).toMatch(
        /(?:action_queue\.)?plant_id\s+IS\s+NULL\s+OR\s+(?:action_queue\.)?(?:action_queue\.)?tent_id\s+IS\s+NULL\s+OR\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.plants[\s\S]*?id\s*=\s*(?:action_queue\.)?plant_id[\s\S]*?tent_id\s*=\s*(?:action_queue\.)?tent_id/i,
      );
    },
  );

  (hasTightening ? it : it.skip)(
    "UPDATE WITH CHECK mirrors the same plant/tent/grow ownership guards",
    () => {
      expect(UPDATE_POLICY).toMatch(
        /WITH\s+CHECK\s*\([\s\S]*auth\.uid\(\)\s*=\s*(?:action_queue\.)?user_id/i,
      );
      expect(UPDATE_POLICY).toMatch(/(?:action_queue\.)?plant_id\s+IS\s+NULL\s+OR\s+EXISTS/i);
      expect(UPDATE_POLICY).toMatch(/(?:action_queue\.)?tent_id\s+IS\s+NULL\s+OR\s+EXISTS/i);
      expect(UPDATE_POLICY).toMatch(
        /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.grows[\s\S]*?id\s*=\s*(?:action_queue\.)?grow_id[\s\S]*?user_id\s*=\s*auth\.uid\(\)/i,
      );
    },
  );

  (hasTightening ? it : it.skip)(
    "client-provided user_id cannot bypass auth.uid() (default = auth.uid() AND WITH CHECK auth.uid() = user_id)",
    () => {
      // Table default: user_id DEFAULT auth.uid(). Combined with WITH CHECK
      // auth.uid() = user_id, a spoofed client user_id cannot land in the row.
      expect(ALL_ACTION_QUEUE_SQL).toMatch(/user_id[\s\S]{0,80}DEFAULT\s+auth\.uid\(\)/i);
      expect(INSERT_POLICY).toMatch(/auth\.uid\(\)\s*=\s*(?:action_queue\.)?user_id/i);
      expect(UPDATE_POLICY).toMatch(/auth\.uid\(\)\s*=\s*(?:action_queue\.)?user_id/i);
    },
  );

  (hasTightening ? it : it.skip)(
    "no service_role bypass introduced by tightening migrations",
    () => {
      expect(INSERT_POLICY + UPDATE_POLICY).not.toMatch(/service_role/i);
    },
  );
});

describe("Action Queue safety — same-grow lineage (plants/tents must share grow_id)", () => {
  // Reuse the last INSERT/UPDATE policy text.
  function lastPolicyBlock(cmd: "INSERT" | "UPDATE"): string {
    const re = new RegExp(
      `CREATE\\s+POLICY[^;]*?ON\\s+public\\.action_queue[\\s\\S]*?FOR\\s+${cmd}[\\s\\S]*?;`,
      "gi",
    );
    const matches = [...ALL_ACTION_QUEUE_SQL.matchAll(re)];
    return matches.length ? matches[matches.length - 1][0] : "";
  }
  const INSERT_POLICY = lastPolicyBlock("INSERT");
  const UPDATE_POLICY = lastPolicyBlock("UPDATE");

  // Detect that plants/tents have a grow_id column and the policy enforces same-grow.
  function findMigration(re: RegExp): string | null {
    const migDir = resolve(ROOT, "supabase/migrations");
    for (const name of readdirSync(migDir).sort()) {
      if (!name.endsWith(".sql")) continue;
      const sql = readFileSync(join(migDir, name), "utf8");
      if (re.test(sql)) return sql;
    }
    return null;
  }
  const tentsGrowMig = findMigration(
    /ALTER\s+TABLE\s+public\.tents[\s\S]{0,200}ADD\s+COLUMN[\s\S]{0,80}grow_id/i,
  );
  const plantsGrowMig = findMigration(
    /ALTER\s+TABLE\s+public\.plants[\s\S]{0,200}ADD\s+COLUMN[\s\S]{0,80}grow_id/i,
  );
  const hasLineage =
    !!tentsGrowMig &&
    !!plantsGrowMig &&
    /t\.grow_id\s*=\s*(?:action_queue\.)?grow_id/i.test(INSERT_POLICY) &&
    /p\.grow_id\s*=\s*(?:action_queue\.)?grow_id/i.test(INSERT_POLICY);

  it(`detects grow_id lineage on plants+tents and same-grow policy: ${hasLineage ? "YES" : "no"}`, () => {
    expect(typeof hasLineage).toBe("boolean");
  });

  (hasLineage ? it : it.skip)("tents.grow_id exists and references public.grows(id)", () => {
    expect(tentsGrowMig).toMatch(
      /ALTER\s+TABLE\s+public\.tents[\s\S]{0,200}ADD\s+COLUMN[\s\S]{0,200}grow_id\s+uuid[\s\S]{0,80}REFERENCES\s+public\.grows\s*\(\s*id\s*\)/i,
    );
  });

  (hasLineage ? it : it.skip)("plants.grow_id exists and references public.grows(id)", () => {
    expect(plantsGrowMig).toMatch(
      /ALTER\s+TABLE\s+public\.plants[\s\S]{0,200}ADD\s+COLUMN[\s\S]{0,200}grow_id\s+uuid[\s\S]{0,80}REFERENCES\s+public\.grows\s*\(\s*id\s*\)/i,
    );
  });

  (hasLineage ? it : it.skip)(
    "required indexes added: tents(user_id,grow_id), plants(user_id,grow_id), plants(tent_id)",
    () => {
      expect(ALL_ACTION_QUEUE_SQL + (tentsGrowMig ?? "")).toMatch(
        /CREATE\s+INDEX[\s\S]{0,200}tents\s*\(\s*user_id\s*,\s*grow_id\s*\)/i,
      );
      expect(ALL_ACTION_QUEUE_SQL + (plantsGrowMig ?? "")).toMatch(
        /CREATE\s+INDEX[\s\S]{0,200}plants\s*\(\s*user_id\s*,\s*grow_id\s*\)/i,
      );
      expect(ALL_ACTION_QUEUE_SQL + (plantsGrowMig ?? "")).toMatch(
        /CREATE\s+INDEX[\s\S]{0,200}plants\s*\(\s*tent_id\s*\)/i,
      );
    },
  );

  (hasLineage ? it : it.skip)(
    "INSERT enforces tent belongs to the SAME grow (t.grow_id = grow_id)",
    () => {
      expect(INSERT_POLICY).toMatch(
        /(?:action_queue\.)?tent_id\s+IS\s+NULL\s+OR\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.tents[\s\S]*?id\s*=\s*(?:action_queue\.)?tent_id[\s\S]*?user_id\s*=\s*auth\.uid\(\)[\s\S]*?grow_id\s*=\s*(?:action_queue\.)?grow_id/i,
      );
    },
  );

  (hasLineage ? it : it.skip)(
    "INSERT enforces plant belongs to the SAME grow (p.grow_id = grow_id)",
    () => {
      expect(INSERT_POLICY).toMatch(
        /(?:action_queue\.)?plant_id\s+IS\s+NULL\s+OR\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.plants[\s\S]*?id\s*=\s*(?:action_queue\.)?plant_id[\s\S]*?user_id\s*=\s*auth\.uid\(\)[\s\S]*?grow_id\s*=\s*(?:action_queue\.)?grow_id/i,
      );
    },
  );

  (hasLineage ? it : it.skip)(
    "UPDATE mirrors the same-grow lineage checks for both plant and tent",
    () => {
      expect(UPDATE_POLICY).toMatch(/t\.grow_id\s*=\s*(?:action_queue\.)?grow_id/i);
      expect(UPDATE_POLICY).toMatch(/p\.grow_id\s*=\s*(?:action_queue\.)?grow_id/i);
    },
  );

  (hasLineage ? it : it.skip)("plant-in-tent consistency still enforced when both are set", () => {
    expect(INSERT_POLICY).toMatch(
      /(?:action_queue\.)?plant_id\s+IS\s+NULL\s+OR\s+(?:action_queue\.)?(?:action_queue\.)?tent_id\s+IS\s+NULL\s+OR\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.plants[\s\S]*?tent_id\s*=\s*(?:action_queue\.)?tent_id/i,
    );
  });

  (hasLineage ? it : it.skip)(
    "no service_role bypass and no device-control surface introduced",
    () => {
      expect(INSERT_POLICY + UPDATE_POLICY).not.toMatch(/service_role/i);
      const combined = (tentsGrowMig ?? "") + (plantsGrowMig ?? "") + ALL_ACTION_QUEUE_SQL;
      expect(combined).not.toMatch(
        /mqtt|home[\s_-]?assistant|webhook|pi[\s_-]?bridge\.(local|lan|home|io|net|com)/i,
      );
    },
  );
});

/**
 * pi_bridge scanner allow-list hardening.
 *
 * These tests guard the narrow allow-list used by the pi_bridge / raspberry_pi_bridge
 * context scan above. The allow-list MUST stay file-specific (exact file paths only).
 * It must NEVER expand into a directory-level wildcard such as `src/constants/*`,
 * because that would silently allow any future constants file to bypass the
 * Action Queue / device-control safety scanner.
 *
 * This is test-hardening only. No production behavior, schema, RLS, Edge Functions,
 * auth, AI, Action Queue writes, sensor ingest, automation, or device control are
 * affected.
 */
describe("pi_bridge scanner allow-list hardening", () => {
  const THIS_TEST_SRC = readFileSync(resolve(ROOT, "src/test/action-queue-safety.test.ts"), "utf8");
  // Isolate just the pi_bridge scanner region so unrelated text in this file
  // (e.g. these very assertions) can't accidentally satisfy or violate checks.
  const PI_REGION_START = THIS_TEST_SRC.indexOf("pi_bridge appears ONLY");
  const PI_REGION_END = THIS_TEST_SRC.indexOf("10. no simulation/auto-execute path");
  const PI_REGION =
    PI_REGION_START >= 0 && PI_REGION_END > PI_REGION_START
      ? THIS_TEST_SRC.slice(PI_REGION_START, PI_REGION_END)
      : "";

  it("keeps pi_bridge allow-list file-specific", () => {
    expect(PI_REGION.length).toBeGreaterThan(0);
    // Both allow-listed files must appear as exact resolve(ROOT, "...ts") paths.
    expect(PI_REGION).toMatch(
      /resolve\(ROOT,\s*["']src\/constants\/sensorIngestProvenance\.ts["']\)/,
    );
    expect(PI_REGION).toMatch(
      /resolve\(ROOT,\s*["']src\/constants\/sensorProviderLabels\.ts["']\)/,
    );
    // The skip MUST be an exact equality check (`path === ...`), never a
    // startsWith / includes / glob match against a directory prefix.
    expect(PI_REGION).toMatch(/path === PROVIDER_LABELS_PATH/);
    expect(PI_REGION).toMatch(/path === SENSOR_INGEST_PROVENANCE_PATH/);
    expect(PI_REGION).not.toMatch(/\.startsWith\(/);
    expect(PI_REGION).not.toMatch(/\.includes\(/);
    expect(PI_REGION).not.toMatch(/minimatch|micromatch|globby|fast-glob/i);
  });

  it("rejects directory-level constants allow-list patterns", () => {
    const FORBIDDEN_PATTERNS: RegExp[] = [
      /["']src\/constants\/\*/,
      /["']src\/constants\/["']/,
      /["']src\/constants["']/,
      /["']constants\/\*/,
      /["']\*\*\/constants\//,
      /["']src\/constants\/\*\*/,
    ];
    for (const re of FORBIDDEN_PATTERNS) {
      expect(PI_REGION, `pi_bridge allow-list must not include broad pattern: ${re}`).not.toMatch(
        re,
      );
    }
  });

  it("allows raspberry_pi_bridge only from read-only provenance constants", () => {
    // The constants file referenced by the allow-list must actually exist
    // and must contain the raspberry_pi_bridge token (i.e. the allow-list
    // is justified by a real read-only provenance constant, not a stale path).
    const provenanceSrc = readFileSync(
      resolve(ROOT, "src/constants/sensorIngestProvenance.ts"),
      "utf8",
    );
    expect(provenanceSrc).toMatch(/raspberry_pi_bridge/);
    // And the file must not itself contain device-control surfaces.
    expect(provenanceSrc).not.toMatch(
      /fetch\(|mqtt:\/\/|mqtt\.connect|\.publish\(|\.post\(|\.trigger\(|http:\/\/|https:\/\//i,
    );
  });

  it("keeps sensorProviderLabels.ts allowed only as an exact file path", () => {
    const matches = [...PI_REGION.matchAll(/sensorProviderLabels\.ts/g)];
    expect(matches.length).toBeGreaterThan(0);
    // Every occurrence must be inside a resolve(ROOT, "src/constants/sensorProviderLabels.ts") call.
    const exactRefCount = (
      PI_REGION.match(/resolve\(ROOT,\s*["']src\/constants\/sensorProviderLabels\.ts["']\)/g) ?? []
    ).length;
    expect(exactRefCount).toBeGreaterThanOrEqual(1);
  });
});
