import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COACH = readFileSync(resolve(__dirname, "../pages/Coach.tsx"), "utf8");
const AI_COACH = readFileSync(
  resolve(__dirname, "../../supabase/functions/ai-coach/index.ts"),
  "utf8",
);

describe("AI Coach → action_queue_events 'created' audit", () => {
  it("action_queue insert returns the new row id via .select().single()", () => {
    expect(COACH).toMatch(
      /\.from\(\s*["']action_queue["']\s*\)[\s\S]{0,400}\.insert\([\s\S]{0,600}\)[\s\S]{0,80}\.select\(\s*["']id,grow_id["']\s*\)[\s\S]{0,40}\.single\(\)/,
    );
  });

  it("inserts action_queue_events only after a successful action_queue insert", () => {
    // Audit insert is inside an `if (inserted?.id)` branch, after the error early-returns.
    expect(COACH).toMatch(
      /if \(inserted\?\.id\) \{[\s\S]{0,400}\.from\(\s*["']action_queue_events["']\s*\)[\s\S]{0,200}\.insert\(/,
    );
  });

  it("created event uses event_type 'created'", () => {
    expect(COACH).toMatch(/event_type:\s*["']created["']/);
  });

  it("created event uses previous_status null and new_status pending_approval", () => {
    expect(COACH).toMatch(/previous_status:\s*null/);
    expect(COACH).toMatch(/new_status:\s*["']pending_approval["']/);
  });

  it("audit insert payload omits user_id (DB default auth.uid() wins)", () => {
    const m = COACH.match(
      /\.from\(\s*["']action_queue_events["']\s*\)\s*\.insert\(\{([\s\S]*?)\}\)/,
    );
    expect(m).toBeTruthy();
    expect(m![1]).not.toMatch(/user_id/);
  });

  it("shows the 'Action queued, but audit log failed.' warning toast", () => {
    expect(COACH).toMatch(/toast\.warning\(\s*["']Action queued, but audit log failed\.["']/);
  });

  it("does not silently swallow audit failures (early return on auditError)", () => {
    expect(COACH).toMatch(/auditError[\s\S]{0,300}toast\.warning[\s\S]{0,200}return;/);
  });

  it("audit insert lives inside the addToQueue click handler, not in a useEffect", () => {
    expect(COACH).toMatch(
      /async\s+function\s+addToQueue[\s\S]*?action_queue_events[\s\S]*?\}\s*$/m,
    );
    expect(COACH).not.toMatch(
      /useEffect\([\s\S]{0,400}action_queue_events[\s\S]{0,200}\.insert\(/,
    );
  });

  it("ai-coach edge function is unchanged: does not write action_queue or audit events", () => {
    expect(AI_COACH).not.toMatch(/action_queue/);
  });

  it("no device-control surface introduced in Coach.tsx", () => {
    expect(COACH).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
  });

  it("no service_role usage in Coach.tsx", () => {
    expect(COACH).not.toMatch(/service_role/i);
  });
});
