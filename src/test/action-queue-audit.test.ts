/**
 * Static safety tests for the action_queue_events audit trail.
 *
 * Asserts:
 *   - Migration creates public.action_queue_events with required columns,
 *     CHECK on event_type, RLS enabled, and owner-locked policies that
 *     also verify the referenced action_queue and grow belong to auth.uid().
 *   - ActionQueue.tsx writes an audit row on approve/simulate/reject and
 *     never sends device commands.
 *   - No service_role / device-control surface introduced anywhere new.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");

function allMigrations(): string {
  const dir = resolve(ROOT, "supabase/migrations");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => readFileSync(join(dir, n), "utf8"))
    .join("\n\n");
}
const MIG = allMigrations();

function aqeMigration(): string {
  const dir = resolve(ROOT, "supabase/migrations");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .map((n) => readFileSync(join(dir, n), "utf8"))
    .find((sql) => /CREATE\s+TABLE\s+public\.action_queue_events/i.test(sql)) ?? "";
}
const AQE = aqeMigration();

describe("action_queue_events — schema & RLS", () => {
  it("table exists with required columns", () => {
    expect(AQE).toMatch(/CREATE\s+TABLE\s+public\.action_queue_events/i);
    expect(AQE).toMatch(/user_id\s+uuid\s+NOT\s+NULL\s+DEFAULT\s+auth\.uid\(\)/i);
    expect(AQE).toMatch(
      /action_queue_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.action_queue\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    );
    expect(AQE).toMatch(/grow_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.grows\(id\)/i);
    expect(AQE).toMatch(/event_type\s+text\s+NOT\s+NULL/i);
    expect(AQE).toMatch(/previous_status\s+text/i);
    expect(AQE).toMatch(/new_status\s+text/i);
    expect(AQE).toMatch(/note\s+text/i);
    expect(AQE).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i);
  });

  it("CHECK constrains event_type to the allowed set", () => {
    for (const t of [
      "created","simulated","approved","rejected","completed","cancelled","note",
    ]) {
      expect(AQE).toMatch(new RegExp(`'${t}'`));
    }
    expect(AQE).toMatch(/event_type\s+IN\s*\(/i);
  });

  it("RLS is enabled", () => {
    expect(AQE).toMatch(
      /ALTER\s+TABLE\s+public\.action_queue_events\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
  });

  it("INSERT policy enforces auth.uid() = user_id + owned action + owned grow", () => {
    expect(AQE).toMatch(
      /FOR\s+INSERT[\s\S]*?WITH\s+CHECK[\s\S]*?auth\.uid\(\)\s*=\s*user_id[\s\S]*?EXISTS\s*\([\s\S]*?action_queue[\s\S]*?a\.user_id\s*=\s*auth\.uid\(\)[\s\S]*?EXISTS\s*\([\s\S]*?grows[\s\S]*?g\.user_id\s*=\s*auth\.uid\(\)/i,
    );
  });

  it("SELECT policy is owner-locked", () => {
    expect(AQE).toMatch(/FOR\s+SELECT[\s\S]*?USING\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
  });

  it("no service_role bypass in the audit migration", () => {
    expect(AQE).not.toMatch(/service_role/i);
  });

  it("no device-control surface introduced in the audit migration", () => {
    expect(AQE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b/i,
    );
  });
});

describe("ActionQueue page — audit wiring", () => {
  it("inserts an event row on transitions", () => {
    expect(PAGE).toMatch(
      /\.from\(\s*["']action_queue_events["']\s*\)[\s\S]{0,200}\.insert\(/,
    );
  });

  it("event insert never sends user_id from the client", () => {
    const m = PAGE.match(
      /\.from\(\s*["']action_queue_events["']\s*\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/\buser_id\s*:/);
  });

  it("approve / reject / simulate each call the transition helper", () => {
    expect(PAGE).toMatch(/function\s+approve[\s\S]*?transition\([\s\S]*?["']approved["'][\s\S]*?["']approved["']\s*\)/);
    expect(PAGE).toMatch(/function\s+reject[\s\S]*?transition\([\s\S]*?["']rejected["'][\s\S]*?["']rejected["']\s*\)/);
    expect(PAGE).toMatch(/function\s+simulate[\s\S]*?transition\([\s\S]*?["']simulated["'][\s\S]*?["']simulated["']\s*\)/);
  });

  it("simulate explicitly states no device command is sent", () => {
    expect(PAGE).toMatch(/no device command sent/i);
  });

  it("approve does NOT call any device-control endpoint", () => {
    expect(PAGE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
  });

  it("audit insert failure shows a warning toast (does not silently swallow)", () => {
    expect(PAGE).toMatch(/toast\.warning\([\s\S]{0,80}audit log failed/i);
  });

  it("renders an event history section", () => {
    expect(PAGE).toMatch(/EventHistory/);
    expect(PAGE).toMatch(/History/);
  });
});
