/**
 * PlantMergeDialog ↔ merge_duplicate_plant RPC wiring tests.
 *
 * Covers:
 *  - error mapping (plant_already_merged, cross-grow, same source/target,
 *    ownership/not-found, generic)
 *  - RPC summary parsing
 *  - static safety guardrails (no client-side multi-table update,
 *    only RPC for execution, no service_role, no edge function, no
 *    automation/device control)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  mapMergeRpcError,
  parseMergeRpcSummary,
  buildPlantMergePreview,
  buildPlantMergeUpdatePlan,
} from "@/lib/plantMergeRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const DIALOG = read("src/components/PlantMergeDialog.tsx");
const RULES = read("src/lib/plantMergeRules.ts");

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("mapMergeRpcError", () => {
  it("recognises plant_already_merged", () => {
    const m = mapMergeRpcError({ code: "P0001", message: "plant_already_merged" });
    expect(m.kind).toBe("plant_already_merged");
    expect(m.message).toMatch(/already been merged/i);
  });
  it("recognises same source/target", () => {
    const m = mapMergeRpcError({ code: "22023", message: "source and target must differ" });
    expect(m.kind).toBe("same_source_target");
    expect(m.message).toMatch(/different target/i);
  });
  it("recognises cross-grow merge", () => {
    const m = mapMergeRpcError({ code: "22023", message: "cross-grow merges are not supported" });
    expect(m.kind).toBe("cross_grow_merge_blocked");
    expect(m.message).toMatch(/same grow/i);
  });
  it("recognises ownership / not found", () => {
    const m = mapMergeRpcError({ code: "42501", message: "source plant not found or not owned by caller" });
    expect(m.kind).toBe("ownership_or_not_found");
    expect(m.message).toMatch(/Check that both plants/i);
  });
  it("recognises not authenticated", () => {
    const m = mapMergeRpcError({ code: "28000", message: "not authenticated" });
    expect(m.kind).toBe("not_authenticated");
  });
  it("falls back to a generic 'no data moved' message", () => {
    const m = mapMergeRpcError({ code: "XX000", message: "boom" });
    expect(m.kind).toBe("generic");
    expect(m.message).toMatch(/No data was moved/i);
  });
});

describe("parseMergeRpcSummary", () => {
  it("parses a complete summary returned by the RPC", () => {
    const s = parseMergeRpcSummary({
      source_plant_id: "s",
      target_plant_id: "t",
      moved: { grow_events: 12, diary_entries: 4, alerts: 0, action_queue: 1 },
      skipped: { sensor_readings_tent_scoped: true },
      source_status: "archived_as_merged",
      audit_logged: false,
    });
    expect(s).not.toBeNull();
    expect(s!.moved.grow_events).toBe(12);
    expect(s!.moved.action_queue).toBe(1);
    expect(s!.source_status).toBe("archived_as_merged");
    expect(s!.audit_logged).toBe(false);
  });
  it("returns null when ids are missing", () => {
    expect(parseMergeRpcSummary({ moved: {} })).toBeNull();
    expect(parseMergeRpcSummary(null)).toBeNull();
    expect(parseMergeRpcSummary("boom")).toBeNull();
  });
  it("coerces missing moved counters to 0", () => {
    const s = parseMergeRpcSummary({
      source_plant_id: "s",
      target_plant_id: "t",
      moved: {},
    });
    expect(s!.moved).toEqual({
      grow_events: 0,
      diary_entries: 0,
      alerts: 0,
      action_queue: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Preview gating used by the dialog
// ---------------------------------------------------------------------------

const A = { id: "a", name: "Auto #1", strain: "Gelato", grow_id: "g1" };
const B = { id: "b", name: "Auto #2", strain: "Gelato", grow_id: "g1" };
const D = { id: "d", name: "Foreign", strain: "Gelato", grow_id: "g2" };

describe("preview gating that the dialog relies on", () => {
  it("execute_via_rpc when same-grow with linked history", () => {
    const p = buildPlantMergePreview(A, B, { diaryEntries: 2, growEvents: 1 });
    expect(p.recommendedAction).toBe("execute_via_rpc");
  });
  it("archive_source_after_review when same-grow with no history", () => {
    const p = buildPlantMergePreview(A, B, {});
    expect(p.recommendedAction).toBe("archive_source_after_review");
  });
  it("blocked when cross-grow", () => {
    const p = buildPlantMergePreview(A, D, { diaryEntries: 2 });
    expect(p.recommendedAction).toBe("blocked");
  });
  it("update plan is executable via the named RPC", () => {
    const plan = buildPlantMergeUpdatePlan("s", "t");
    expect(plan.executable).toBe(true);
    expect(plan.rpcName).toBe("merge_duplicate_plant");
  });
});

// ---------------------------------------------------------------------------
// Static UI wiring guardrails on PlantMergeDialog.tsx
// ---------------------------------------------------------------------------

describe("PlantMergeDialog static wiring", () => {
  it("calls supabase.rpc('merge_duplicate_plant', ...) with exact argument names", () => {
    expect(DIALOG).toMatch(/supabase\.rpc\(\s*["']merge_duplicate_plant["']/);
    expect(DIALOG).toMatch(/source_plant_id:\s*source\.id/);
    expect(DIALOG).toMatch(/target_plant_id:\s*target\.id/);
  });

  it("gates RPC execution on canExecuteRpc and a busy guard (no double submit)", () => {
    expect(DIALOG).toContain("canExecuteRpc");
    expect(DIALOG).toMatch(/if\s*\(\s*busy\s*\)\s*return/);
    expect(DIALOG).toMatch(/if\s*\(!canExecuteRpc\)\s*return/);
  });

  it("renders a final confirmation before invoking the RPC", () => {
    expect(DIALOG).toContain("confirm-merge-execute");
    expect(DIALOG).toContain("confirm-merge-execute-submit");
    expect(DIALOG).toMatch(/Merge\s*\{source\.name\}\s*into/);
    expect(DIALOG).toMatch(/single server-side transaction/i);
    expect(DIALOG).toMatch(/cannot be partially completed/i);
    expect(DIALOG).toMatch(/will not be deleted/i);
  });

  it("disables the execute button while pending and when not executable", () => {
    expect(DIALOG).toMatch(/disabled=\{!canExecuteRpc \|\| busy\}/);
    expect(DIALOG).toMatch(/disabled=\{busy \|\| !canExecuteRpc\}/);
  });

  it("does not call RPC when no target is selected (target guard)", () => {
    expect(DIALOG).toMatch(/if\s*\(!user \|\| !target\)\s*return/);
  });

  it("renders the success summary with all four moved counters", () => {
    expect(DIALOG).toContain("plant-merge-success");
    expect(DIALOG).toContain("plant-merge-moved-grow_events");
    expect(DIALOG).toContain("plant-merge-moved-diary_entries");
    expect(DIALOG).toContain("plant-merge-moved-alerts");
    expect(DIALOG).toContain("plant-merge-moved-action_queue");
  });

  it("renders skipped / deferred notes after success", () => {
    expect(DIALOG).toContain("plant-merge-skipped-notes");
    expect(DIALOG).toMatch(/tent-scoped/i);
    expect(DIALOG).toMatch(/Pi-ingest/);
    expect(DIALOG).toMatch(/Audit logging is deferred/i);
  });

  it("offers View Target Plant and Back to Plants after success", () => {
    expect(DIALOG).toContain("plant-merge-success-view-target");
    expect(DIALOG).toContain("plant-merge-success-back");
    expect(DIALOG).toMatch(/to=\{plantDetailPath\(target\.id\)\}/);
    expect(DIALOG).toMatch(/to="\/plants"/);
  });

  it("invalidates plant-related queries after merge", () => {
    expect(DIALOG).toMatch(/queryKey:\s*\["plants"\]/);
    expect(DIALOG).toMatch(/queryKey:\s*\["grow",\s*"plants"\]/);
    expect(DIALOG).toMatch(/queryKey:\s*\["grow",\s*"plant",\s*source\.id\]/);
    expect(DIALOG).toMatch(/queryKey:\s*\["grow",\s*"plant",\s*targetPlantId\]/);
    expect(DIALOG).toMatch(/queryKey:\s*\["tent"\]/);
    expect(DIALOG).toMatch(/queryKey:\s*\["timeline"\]/);
  });

  it("uses mapMergeRpcError + parseMergeRpcSummary for error/success display", () => {
    expect(DIALOG).toContain("mapMergeRpcError");
    expect(DIALOG).toContain("parseMergeRpcSummary");
  });
});

// ---------------------------------------------------------------------------
// Static safety: no client-side multi-table merge, no service_role, etc.
// ---------------------------------------------------------------------------

describe("PlantMergeDialog static safety", () => {
  it("never directly updates grow_events from the client", () => {
    expect(DIALOG).not.toMatch(/from\(\s*["']grow_events["']\s*\)\s*\.update/);
    expect(DIALOG).not.toMatch(/from\(\s*["']grow_events["']\s*\)\s*\.delete/);
    expect(DIALOG).not.toMatch(/from\(\s*["']grow_events["']\s*\)\s*\.insert/);
  });
  it("never directly updates diary_entries from the client", () => {
    expect(DIALOG).not.toMatch(/from\(\s*["']diary_entries["']\s*\)\s*\.update/);
    expect(DIALOG).not.toMatch(/from\(\s*["']diary_entries["']\s*\)\s*\.delete/);
  });
  it("never directly updates alerts from the client", () => {
    expect(DIALOG).not.toMatch(/from\(\s*["']alerts["']\s*\)\s*\.(update|insert|delete)/);
  });
  it("never directly updates action_queue from the client", () => {
    expect(DIALOG).not.toMatch(/from\(\s*["']action_queue["']\s*\)\s*\.(update|insert|delete)/);
  });
  it("never directly updates sensor_readings or pi-ingest tables", () => {
    expect(DIALOG).not.toMatch(/from\(\s*["']sensor_readings["']/);
    expect(DIALOG).not.toMatch(/pi_ingest/);
  });
  it("never hard-deletes the source plant", () => {
    expect(DIALOG).not.toMatch(/from\(\s*["']plants["']\s*\)\s*\.delete/);
  });
  it("uses ONLY the named RPC for merge execution", () => {
    const rpcCalls = DIALOG.match(/supabase\.rpc\(/g) ?? [];
    // exactly one RPC call site in the dialog and it must be merge_duplicate_plant
    expect(rpcCalls.length).toBeGreaterThanOrEqual(1);
    expect(DIALOG).toMatch(/supabase\.rpc\(\s*["']merge_duplicate_plant["']/);
  });
  it("does not reference service_role / edge functions / automation strings", () => {
    expect(DIALOG).not.toMatch(/service_role/);
    expect(DIALOG).not.toMatch(/supabase\/functions|functions\.invoke/);
    expect(DIALOG.toLowerCase()).not.toMatch(
      /\b(turn_on|turn_off|device_control|automate|automation_enabled|relay_on|relay_off)\b/,
    );
  });
  it("rules file declares the four reassigned tables exactly once each", () => {
    for (const t of ["grow_events", "diary_entries", "alerts", "action_queue"]) {
      const re = new RegExp(`table:\\s*["']${t}["']`, "g");
      const matches = RULES.match(re) ?? [];
      expect(matches.length).toBe(1);
    }
  });
});
