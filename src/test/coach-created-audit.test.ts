/**
 * Coach Action Queue create is atomic: created audit is server-side via
 * action_queue_create (#586 residual). No client events insert.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COACH = readFileSync(resolve(__dirname, "../pages/Coach.tsx"), "utf8");
const AI_COACH = readFileSync(
  resolve(__dirname, "../../supabase/functions/ai-coach/index.ts"),
  "utf8",
);
const SERVICE = readFileSync(resolve(__dirname, "../lib/actionQueueCreateService.ts"), "utf8");

describe("AI Coach → action_queue_create atomic audit", () => {
  it("uses createActionQueueItem (RPC) instead of dual client inserts", () => {
    expect(COACH).toMatch(/createActionQueueItem/);
    expect(COACH).not.toMatch(/\.from\(\s*["']action_queue["']\s*\)\s*\.insert\(/);
    expect(COACH).not.toMatch(/\.from\(\s*["']action_queue_events["']\s*\)\s*\.insert\(/);
    expect(COACH).not.toMatch(/Action queued, but audit log failed/);
  });

  it("shared service calls action_queue_create", () => {
    expect(SERVICE).toMatch(/action_queue_create/);
    expect(SERVICE).not.toMatch(/from\(["']action_queue["']\)\.insert/);
  });

  it("Coach create handlers live in click paths, not useEffect", () => {
    expect(COACH).toMatch(/async\s+function\s+addToQueue[\s\S]*?createActionQueueItem/);
    expect(COACH).toMatch(
      /async\s+function\s+addDoctorSuggestionToQueue[\s\S]*?createActionQueueItem/,
    );
    expect(COACH).not.toMatch(/useEffect\([\s\S]{0,400}createActionQueueItem/);
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
