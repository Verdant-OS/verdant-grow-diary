import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const PERSISTENCE_FILE = "src/lib/harvestCureQuickLogPersistencePayload.ts";

const FORBIDDEN_IMPORTS = [
  /from\s+["']@\/integrations\/supabase/i,
  /supabase\.from\(/i,
  /\.rpc\(/i,
  /openai|anthropic|gemini|lovable\/ai-gateway|@\/lib\/ai\//i,
  /alertsService|action[_-]?queue|deviceControl|hardwareControl/i,
  /service_role|SERVICE_ROLE/,
];

const FORBIDDEN_WORDING = [
  { name: "fake-live", re: /\b(?:fake|simulated|forced)\s*live\b/i },
  { name: "auto-execute", re: /\bauto[-_ ]?(?:execute|adjust|control)\b/i },
  { name: "device-control", re: /\bdevice[-_ ]?control\b/i },
];

function functionBody(sourceSql: string, functionName: string): string {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    sourceSql.match(
      new RegExp(
        `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${escapedName}[\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$`,
        "i",
      ),
    )?.[1] ?? ""
  );
}

function effectiveQuickLogSaveBody(dir: string, files: string[]): string {
  const rpcFiles = files
    .filter((file) =>
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_event\b/i.test(
        readFileSync(join(dir, file), "utf8"),
      ),
    )
    .sort();
  expect(rpcFiles.length).toBeGreaterThan(0);

  const latest = rpcFiles[rpcFiles.length - 1];
  const latestSql = readFileSync(join(dir, latest), "utf8");
  const wrapperBody = functionBody(latestSql, "quicklog_save_event");
  expect(wrapperBody.length).toBeGreaterThan(200);

  if (!/quicklog_save_event_pre_logged_at\s*\(/i.test(wrapperBody)) {
    return wrapperBody;
  }

  const earlier = files
    .filter((file) => file.localeCompare(latest) < 0)
    .sort((a, b) => b.localeCompare(a));
  for (const file of earlier) {
    const directDelegate = functionBody(
      readFileSync(join(dir, file), "utf8"),
      "quicklog_save_event_pre_logged_at",
    );
    if (directDelegate) return `${directDelegate}\n${wrapperBody}`;
  }

  const renameBoundary = earlier.find((file) =>
    /ALTER\s+FUNCTION\s+public\.quicklog_save_event[\s\S]*?RENAME\s+TO\s+quicklog_save_event_pre_logged_at/i.test(
      readFileSync(join(dir, file), "utf8"),
    ),
  );
  expect(renameBoundary).toBeDefined();

  for (const file of earlier.filter((candidate) => candidate.localeCompare(renameBoundary!) < 0)) {
    const delegatedBody = functionBody(
      readFileSync(join(dir, file), "utf8"),
      "quicklog_save_event",
    );
    if (delegatedBody) return `${delegatedBody}\n${wrapperBody}`;
  }

  throw new Error("Could not resolve the effective quicklog_save_event delegate");
}

describe("harvest/cure Quick Log persistence slice static safety", () => {
  it(`${PERSISTENCE_FILE} contains no forbidden imports/wording`, () => {
    const text = readFileSync(PERSISTENCE_FILE, "utf8");
    for (const re of FORBIDDEN_IMPORTS) {
      expect(re.test(text), `${PERSISTENCE_FILE}: forbidden import ${re}`).toBe(false);
    }
    for (const p of FORBIDDEN_WORDING) {
      expect(p.re.test(text), `${PERSISTENCE_FILE}: forbidden wording ${p.name}`).toBe(false);
    }
  });

  it("persistence builder does not import alerts/action-queue/AI helpers", () => {
    const text = readFileSync(PERSISTENCE_FILE, "utf8");
    // Only imports allowed: pure constants + harvest/cure rules + the pure
    // weight-unit normalizer (itself constants-only — no supabase/fetch).
    const fromLines = text.split("\n").filter((l) => /^\s*}?\s*from\s+["']/.test(l));
    for (const line of fromLines) {
      expect(
        /["']@\/constants\/quickLog(Event|Activity)Types["']|["']\.\/harvestCureRules["']|["']\.\/harvestWeightUnitNormalization["']/.test(
          line,
        ),
        `unexpected import: ${line}`,
      ).toBe(true);
    }
  });

  it("most-recent grow_events trigger migration includes harvest + cure_check", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    // Search every migration that defines validate_grow_event for the latest
    // one (lexicographic name order matches timestamp order in this repo).
    const triggerFiles = files
      .filter((f) =>
        readFileSync(join(dir, f), "utf8").includes(
          "CREATE OR REPLACE FUNCTION public.validate_grow_event()",
        ),
      )
      .sort();
    expect(triggerFiles.length).toBeGreaterThan(0);
    const latest = triggerFiles[triggerFiles.length - 1];
    const sql = readFileSync(join(dir, latest), "utf8");
    expect(sql).toMatch(/'harvest'/);
    expect(sql).toMatch(/'cure_check'/);
    // Existing types must still be present.
    for (const ev of [
      "'watering'",
      "'feeding'",
      "'training'",
      "'observation'",
      "'photo'",
      "'environment'",
    ]) {
      expect(sql).toContain(ev);
    }
    // No RLS/policy/grant changes touching grow_events. (New tables a later
    // migration creates — e.g. breeding_events with owner-scoped RLS — are
    // legitimate and out of this invariant's scope.)
    expect(
      /(?:CREATE|DROP)\s+POLICY[^;]*\bgrow_events\b|ALTER\s+TABLE[^;]*\bgrow_events\b[^;]*ROW LEVEL SECURITY/i.test(
        sql,
      ),
    ).toBe(false);
    // No service_role grants added on grow_events.
    expect(/GRANT[^;]*\bgrow_events\b[^;]*service_role/i.test(sql)).toBe(false);
  });

  it("effective quicklog_save_event implementation includes harvest + cure_check in whitelist", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    const effectiveBody = effectiveQuickLogSaveBody(dir, files);
    expect(effectiveBody).toMatch(/p_event_type\s+NOT\s+IN[\s\S]*?'harvest'/);
    expect(effectiveBody).toMatch(/p_event_type\s+NOT\s+IN[\s\S]*?'cure_check'/);
  });
});
