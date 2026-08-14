/**
 * Static safety tests for the "Add to Action Queue" flow in AI Coach.
 *
 * Guarantees (all via source-level assertions; no live DB calls):
 *   - The Coach UI creates queue rows ONLY from a user click handler via
 *     action_queue_create (createActionQueueItem), never auto-runs.
 *   - The payload never contains a client-provided user_id.
 *   - source is ai_coach (Coach recs) / ai_doctor (structured diagnosis).
 *   - Server forces pending_approval (client does not insert status).
 *   - The lineage-failure message is shown on ownership/forbidden failures.
 *   - No device-control surface.
 *   - ai-coach edge function still does not write to action_queue.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const COACH = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");
const AI_COACH = readFileSync(resolve(ROOT, "supabase/functions/ai-coach/index.ts"), "utf8");

describe("AI Coach → Action Queue (manual, suggest-only, atomic RPC)", () => {
  it("queues via createActionQueueItem from a named click handler, not on render", () => {
    expect(COACH).toMatch(/async\s+function\s+addToQueue[\s\S]{0,1200}createActionQueueItem\s*\(/);
    expect(COACH).toMatch(/onClick=\{\(\)\s*=>\s*addToQueue\(/);
    expect(COACH).not.toMatch(/useEffect\([\s\S]{0,400}createActionQueueItem/);
    // No legacy dual-insert path.
    expect(COACH).not.toMatch(/\.from\(\s*["']action_queue["']\s*\)\s*\.insert\(/);
    expect(COACH).not.toMatch(/\.from\(\s*["']action_queue_events["']\s*\)\s*\.insert\(/);
  });

  it("create payload does NOT include user_id or target_device", () => {
    const match = COACH.match(/createActionQueueItem\(\s*\{([\s\S]*?)\}\s*\)/);
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).not.toMatch(/\buser_id\s*:/);
    expect(body).not.toMatch(/\btarget_device\s*:/);
    expect(body).not.toMatch(/\bstatus\s*:/);
  });

  it("Coach recommendations pin source=ai_coach and use server dedupe", () => {
    expect(COACH).toMatch(/source:\s*ACTION_QUEUE_SOURCE_VALUES\.AI_COACH/);
    expect(COACH).toMatch(/buildAiCoachRecommendationDedupeKey\(/);
    expect(COACH).toMatch(/audit_note:\s*["']Created from AI Coach recommendation["']/);
  });

  it("AI Doctor suggestions on Coach pin source=ai_doctor via createActionQueueItem", () => {
    expect(COACH).toMatch(
      /async\s+function\s+addDoctorSuggestionToQueue[\s\S]{0,1200}createActionQueueItem\s*\(/,
    );
    expect(COACH).toMatch(/source:\s*ACTION_QUEUE_SOURCE_VALUES\.AI_DOCTOR/);
    expect(COACH).toMatch(/buildAiDoctorCoachSuggestionDedupeKey\(/);
  });

  it("create sends grow_id and required advisory fields", () => {
    expect(COACH).toMatch(/grow_id:\s*activeGrowId/);
    expect(COACH).toMatch(/target_metric:\s*["']general["']/);
    expect(COACH).toMatch(/suggested_change:/);
    expect(COACH).toMatch(/reason:/);
    expect(COACH).toMatch(/risk_level:/);
    expect(COACH).toMatch(/action_type:/);
  });

  it("lineage / forbidden failures show the repair-prompt message", () => {
    expect(COACH).toMatch(
      /This action cannot be queued until the plant\/tent is assigned to this grow/,
    );
    expect(COACH).toMatch(/plant_not_in_grow|tent_not_in_grow|forbidden/);
  });

  it("success toast reads Action queued for approval (or already in queue)", () => {
    expect(COACH).toMatch(/Action queued for approval\./);
    expect(COACH).toMatch(/Action already in queue for approval\./);
  });

  it("links the user to /actions from the Coach result", () => {
    expect(COACH).toMatch(/to=\{actionsPath\(\)\}/);
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
