import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATION = readFileSync(
  resolve(ROOT, "supabase/migrations/20260725093000_restore_action_queue_owner_decisions.sql"),
  "utf8",
);
const ACTION_DETAIL = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");
const ACTION_QUEUE = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");

describe("Action Queue owner decision guard", () => {
  it("allows only the row owner, an operator, or service_role to change decisions", () => {
    expect(MIGRATION).toMatch(/OLD\.user_id\s*=\s*v_uid/i);
    expect(MIGRATION).toMatch(/NEW\.user_id\s*=\s*OLD\.user_id/i);
    expect(MIGRATION).toMatch(/public\.has_role\(v_uid,\s*'operator'/i);
    expect(MIGRATION).toMatch(/v_role\s*=\s*'service_role'/i);
    expect(MIGRATION).toContain("only be modified by the row owner, operators, or service_role");
  });

  it("covers every lifecycle timestamp without introducing device execution", () => {
    expect(MIGRATION).toMatch(
      /BEFORE UPDATE OF status,\s*approved_at,\s*rejected_at,\s*completed_at/i,
    );
    expect(MIGRATION).toMatch(/v_completed_changed/i);
    expect(MIGRATION).not.toMatch(/mqtt|home[_ -]?assistant|relay|actuator|device[_ -]?command/i);
  });

  it("shows simulation success only after the atomic RPC transition succeeds", () => {
    expect(ACTION_DETAIL).toMatch(
      /const success = await transition\(row,\s*kind,\s*note\)[\s\S]*?if \(success && kind === "simulate"\)[\s\S]*?toast\.message\("Simulated/,
    );
    expect(ACTION_QUEUE).toMatch(
      /const success = await transition\(row,\s*kind,\s*note\)[\s\S]*?if \(success && kind === "simulate"\)[\s\S]*?toast\.message\("Simulated/,
    );
  });

  it("reconciles an open drawer after reload and uses exact transition guards", () => {
    expect(ACTION_QUEUE).toMatch(
      /setDrawerRow\(\(current\)\s*=>\s*current\s*\?\s*\(?\s*list\.find\(\(row\)\s*=>\s*row\.id\s*===\s*current\.id\)\s*\?\?\s*null\s*\)?\s*:\s*null/,
    );
    expect(ACTION_QUEUE).toMatch(
      /canApprove=\{!!drawerRow\s*&&\s*canApproveAction\(drawerRow\.status\)\}/,
    );
    expect(ACTION_QUEUE).toMatch(
      /canReject=\{!!drawerRow\s*&&\s*canRejectAction\(drawerRow\.status\)\}/,
    );
  });
});
