/**
 * Static tests for Action Queue events on the Grow Timeline.
 *
 * Asserts:
 *  - Timeline.tsx fetches action_queue_events scoped by grow_id.
 *  - The fetch selects the columns required to render
 *    event_type, previous_status, new_status, note, created_at,
 *    and joins the parent action for suggested_change / reason.
 *  - Events are ordered newest-first and re-sorted defensively in the view.
 *  - A clearly labeled "Action Queue events" section is rendered.
 *  - All required event_type labels are supported.
 *  - The section is read-only (no edit/delete/update handlers wired).
 *  - Notes render when present.
 *  - No device-control surface introduced.
 *  - No UPDATE policy added to action_queue_events.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");

function allMigrations(): string {
  const dir = resolve(ROOT, "supabase/migrations");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => readFileSync(join(dir, n), "utf8"))
    .join("\n\n");
}
const MIG = allMigrations();

describe("Timeline — action_queue_events fetch", () => {
  it("queries action_queue_events table", () => {
    expect(PAGE).toMatch(/\.from\(\s*["']action_queue_events["']\s*\)/);
  });

  it("filters by the active grow_id", () => {
    expect(PAGE).toMatch(
      /\.from\(\s*["']action_queue_events["']\s*\)[\s\S]*?\.eq\(\s*["']grow_id["']\s*,\s*activeGrowId\s*\)/,
    );
  });

  it("selects required columns and joins parent action for suggested_change/reason", () => {
    expect(PAGE).toMatch(
      /action_queue_events["']\s*\)\s*\.select\(\s*["'][^"']*event_type[^"']*previous_status[^"']*new_status[^"']*note[^"']*created_at[^"']*action_queue\(suggested_change,reason\)/,
    );
  });

  it("orders newest-first at the DB layer", () => {
    expect(PAGE).toMatch(
      /action_queue_events[\s\S]{0,400}\.order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/,
    );
  });
});

describe("Timeline — Action Queue events section", () => {
  it("renders a clearly labeled section", () => {
    expect(PAGE).toMatch(/aria-label=\s*["']Action Queue events["']/);
    expect(PAGE).toMatch(/Action Queue events/);
    expect(PAGE).toMatch(/read-only/);
  });

  it("supports all required event_type labels", () => {
    for (const t of [
      "simulated",
      "approved",
      "rejected",
      "completed",
      "cancelled",
      "note",
    ]) {
      expect(PAGE).toMatch(new RegExp(`["']${t}["']`));
    }
  });

  it("renders previous_status → new_status, suggested_change, reason, note, created_at", () => {
    expect(PAGE).toMatch(/e\.previous_status[\s\S]{0,40}e\.new_status/);
    expect(PAGE).toMatch(/e\.action\?\.suggested_change/);
    expect(PAGE).toMatch(/e\.action\?\.reason/);
    expect(PAGE).toMatch(/\{e\.note\}/);
    expect(PAGE).toMatch(/e\.created_at/);
  });

  it("re-sorts newest-first defensively in the view layer", () => {
    expect(PAGE).toMatch(
      /sort\(\s*\([^)]*\)\s*=>\s*new Date\(b\.created_at\)\.getTime\(\)\s*-\s*new Date\(a\.created_at\)\.getTime\(\)/,
    );
  });

  it("section returns null when there are no events", () => {
    expect(PAGE).toMatch(/if\s*\(\s*!events\?\.length\s*\)\s*return\s+null/);
  });

  it("is read-only: no onClick edit / update / delete handlers wired in the section", () => {
    // crude but effective: the Action Queue section has no buttons or onClick
    const start = PAGE.indexOf("function ActionQueueEventsSection");
    expect(start).toBeGreaterThan(-1);
    const section = PAGE.slice(start);
    expect(section).not.toMatch(/onClick=/);
    expect(section).not.toMatch(/\.update\(/);
    expect(section).not.toMatch(/\.delete\(/);
    expect(section).not.toMatch(/EntryEditDialog/);
  });
});

describe("Timeline — safety", () => {
  it("no device-control surface introduced", () => {
    expect(PAGE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
  });

  it("no UPDATE policy exists for action_queue_events in any migration", () => {
    expect(MIG).not.toMatch(
      /CREATE\s+POLICY[\s\S]*?ON\s+public\.action_queue_events[\s\S]*?FOR\s+UPDATE/i,
    );
  });
});
