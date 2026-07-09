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
    // No RLS changes in this migration.
    expect(/CREATE\s+POLICY|DROP\s+POLICY|ALTER\s+TABLE[^;]*ROW LEVEL SECURITY/i.test(sql)).toBe(
      false,
    );
    // No service_role grants added.
    expect(/GRANT[^;]*service_role/i.test(sql)).toBe(false);
  });

  it("latest quicklog_save_event migration includes harvest + cure_check in whitelist", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    const rpcFiles = files
      .filter((f) =>
        readFileSync(join(dir, f), "utf8").includes(
          "CREATE OR REPLACE FUNCTION public.quicklog_save_event(",
        ),
      )
      .sort();
    expect(rpcFiles.length).toBeGreaterThan(0);
    const latest = rpcFiles[rpcFiles.length - 1];
    const sql = readFileSync(join(dir, latest), "utf8");
    expect(sql).toMatch(/p_event_type\s+NOT\s+IN[\s\S]*?'harvest'/);
    expect(sql).toMatch(/p_event_type\s+NOT\s+IN[\s\S]*?'cure_check'/);
  });
});
