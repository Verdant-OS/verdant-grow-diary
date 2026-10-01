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

  it("active quicklog_save_event path retains harvest + cure_check in whitelist", () => {
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
    const wrapperSql = readFileSync(join(dir, latest), "utf8");
    let validatorSql = wrapperSql;
    if (!/p_event_type\s+NOT\s+IN/.test(wrapperSql)) {
      // The dual-timestamp wrapper delegates event-type validation to the
      // pre-logged_at function renamed from the immediately prior public RPC.
      expect(wrapperSql).toMatch(/(?:RETURN|:=)\s+public\.quicklog_save_event_pre_logged_at\(/);
      const renameMigration = files
        .filter((name) => name <= latest)
        .sort()
        .reverse()
        .find((name) =>
          /RENAME\s+TO\s+quicklog_save_event_pre_logged_at/i.test(
            readFileSync(join(dir, name), "utf8"),
          ),
        );
      expect(renameMigration).toBeDefined();
      const delegateMigration = rpcFiles.filter((name) => name < renameMigration!).at(-1);
      expect(delegateMigration).toBeDefined();
      validatorSql = readFileSync(join(dir, delegateMigration!), "utf8");
    }
    expect(validatorSql).toMatch(/p_event_type\s+NOT\s+IN[\s\S]*?'harvest'/);
    expect(validatorSql).toMatch(/p_event_type\s+NOT\s+IN[\s\S]*?'cure_check'/);
  });
});
