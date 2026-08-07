/**
 * Static contract tests for the action_queue_create migration (#586).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260807010000_action_queue_create_rpc.sql";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("action_queue_create migration (#586)", () => {
  const sql = read(MIGRATION);

  it("defines action_queue_create as SECURITY DEFINER with empty search_path", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.action_queue_create\s*\(/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
  });

  it("never accepts client user_id or target_device", () => {
    expect(sql).toMatch(/v_uid uuid := auth\.uid\(\)/);
    expect(sql).not.toMatch(/p_user_id/);
    expect(sql).toMatch(/target_device/);
    // Forced null in the INSERT VALUES list (never a client parameter).
    expect(sql).toMatch(/NULL, -- never accept device control surface/);
    expect(sql).not.toMatch(/p_target_device/);
  });

  it("inserts row and created audit event in one function body", () => {
    expect(sql).toMatch(/INSERT INTO public\.action_queue/);
    expect(sql).toMatch(/INSERT INTO public\.action_queue_events/);
    expect(sql).toMatch(/event_type,\s*\n\s*'created'|event_type = 'created'|"created"/);
    expect(sql).toMatch(/'created'/);
  });

  it("adds dedupe_key + partial unique index for non-terminal rows", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS dedupe_key text/);
    expect(sql).toMatch(/action_queue_user_dedupe_key_nonterminal_uidx/);
    expect(sql).toMatch(/pending_approval/);
  });

  it("re-checks grow ownership and grants only to authenticated", () => {
    expect(sql).toMatch(/FROM public\.grows AS g/);
    expect(sql).toMatch(/g\.user_id = v_uid/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.action_queue_create/);
    expect(sql).toMatch(/TO authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.action_queue_create[\s\S]*FROM anon/);
  });

  it("forces pending_approval and contains no device-control language as behavior", () => {
    expect(sql).toMatch(/'pending_approval'/);
    expect(sql.toLowerCase()).not.toMatch(/set fan|dose nutrients|service_role/);
  });
});

describe("client create paths prefer the atomic RPC (#586)", () => {
  it("shared service calls action_queue_create", () => {
    const src = read("src/lib/actionQueueCreateService.ts");
    expect(src).toMatch(/action_queue_create/);
    expect(src).toMatch(/createActionQueueItem/);
    expect(src).not.toMatch(/from\(["']action_queue["']\)\.insert/);
  });

  it("AI Doctor handoff uses createActionQueueItem", () => {
    const src = read("src/hooks/useAddAiDoctorSessionSuggestionToActionQueue.ts");
    expect(src).toMatch(/createActionQueueItem/);
    expect(src).toMatch(/buildAiDoctorSessionDedupeKey/);
    // No longer two-step insert + audit.
    expect(src).not.toMatch(/from\(["']action_queue_events["']\)\.insert/);
  });

  it("Alert Detail handoff uses createActionQueueItem", () => {
    const src = read("src/pages/AlertDetail.tsx");
    expect(src).toMatch(/createActionQueueItem/);
    expect(src).toMatch(/buildEnvironmentAlertDedupeKey/);
    expect(src).not.toMatch(/Action queued, but audit log failed/);
  });
});
