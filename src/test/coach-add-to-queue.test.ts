/**
 * Static safety tests for the "Add to Action Queue" flow in AI Coach.
 *
 * Guarantees (all via source-level assertions; no live DB calls):
 *   - The Coach UI inserts into action_queue ONLY from a user click handler,
 *     never auto-runs.
 *   - The insert payload never contains a client-provided user_id (DB default
 *     auth.uid() is the only source of truth).
 *   - status is "pending_approval" and source is "ai_coach".
 *   - The lineage-failure message is shown on RLS violations.
 *   - No device-control surface (mqtt / home assistant / pi bridge / webhook /
 *     relay / actuator) is introduced.
 *   - ai-coach edge function still does not write to action_queue.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const COACH = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");
const AI_COACH = readFileSync(
  resolve(ROOT, "supabase/functions/ai-coach/index.ts"),
  "utf8",
);

describe("AI Coach → Action Queue (manual, suggest-only)", () => {
  it("inserts into action_queue only from a named click handler, not on render", () => {
    // The insert lives inside an async addToQueue handler.
    expect(COACH).toMatch(
      /async\s+function\s+addToQueue[\s\S]{0,1500}\.from\(\s*["']action_queue["']\s*\)[\s\S]{0,200}\.insert\(/,
    );
    // The button wires it via onClick, not useEffect.
    expect(COACH).toMatch(/onClick=\{\(\)\s*=>\s*addToQueue\(/);
    // No top-level effect auto-creates queue rows.
    expect(COACH).not.toMatch(
      /useEffect\([\s\S]{0,400}action_queue[\s\S]{0,200}\.insert\(/,
    );
  });

  it("insert payload does NOT include user_id (DB default auth.uid() wins)", () => {
    const match = COACH.match(
      /\.from\(\s*["']action_queue["']\s*\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/,
    );
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).not.toMatch(/\buser_id\s*:/);
  });

  it("insert pins status='pending_approval' and source='ai_coach'", () => {
    expect(COACH).toMatch(/status\s*:\s*["']pending_approval["']/);
    expect(COACH).toMatch(/source\s*:\s*["']ai_coach["']/);
  });

  it("insert sends grow_id and a target so action_queue constraints pass", () => {
    expect(COACH).toMatch(/grow_id\s*:\s*activeGrowId/);
    expect(COACH).toMatch(/(target_metric|target_device)\s*:/);
    expect(COACH).toMatch(/suggested_change\s*:/);
    expect(COACH).toMatch(/reason\s*:/);
    expect(COACH).toMatch(/risk_level\s*:/);
    expect(COACH).toMatch(/action_type\s*:/);
  });

  it("RLS lineage failure shows the repair-prompt message", () => {
    expect(COACH).toMatch(
      /This action cannot be queued until the plant\/tent is assigned to this grow/,
    );
    expect(COACH).toMatch(/42501|row-level security/);
  });

  it("success toast reads 'Action queued for approval.'", () => {
    expect(COACH).toMatch(/Action queued for approval\./);
  });

  it("links the user to /actions from the Coach result", () => {
    expect(COACH).toMatch(/to=["']\/actions["']/);
  });

  it("Coach.tsx introduces no device-control surface", () => {
    expect(COACH).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
  });

  it("ai-coach edge function still does NOT write to action_queue", () => {
    expect(AI_COACH).not.toMatch(/action_queue/i);
    expect(AI_COACH).not.toMatch(/\.insert\(/);
    expect(AI_COACH).not.toMatch(/\.update\(/);
    expect(AI_COACH).not.toMatch(/\.delete\(/);
  });
});
