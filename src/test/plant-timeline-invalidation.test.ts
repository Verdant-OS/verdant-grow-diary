/**
 * Static safety: plant-level timeline invalidation after Quick Log save.
 *
 * Verifies that both AppShell mobile FAB (QuickLog) and the plant-detail
 * Quick Log button (PlantQuickLog) call applyQuickLogV2Refresh on success,
 * which includes `["quick_log_grouped_timeline"]` in ALWAYS_KEYS so
 * QuickLogGroupedTimelineSection refreshes without a page reload.
 *
 * Hard constraints — these files must not:
 *  - Write to any table beyond their existing contract
 *  - Invoke Edge Functions / Action Queue / sensor-ingest / AI Doctor sessions
 *  - Introduce device-control language
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function src(rel: string): string {
  return readFileSync(resolve(__dirname, "../..", rel), "utf8");
}

const QUICK_LOG = "src/components/QuickLog.tsx";
const PLANT_QUICK_LOG = "src/components/PlantQuickLog.tsx";
const REFRESH_RULES = "src/lib/quickLogV2RefreshRules.ts";

describe("plant timeline invalidation — QuickLog (mobile FAB)", () => {
  it("calls applyQuickLogV2Refresh on successful save", () => {
    const body = src(QUICK_LOG);
    expect(body).toMatch(/applyQuickLogV2Refresh\s*\(\s*queryClient/);
  });

  it("no longer has isolated invalidateQueries for grow_events without the grouped timeline key", () => {
    const body = src(QUICK_LOG);
    // The old pattern had three separate invalidateQueries calls that skipped
    // quick_log_grouped_timeline. Ensure we now delegate to the rule function.
    expect(body).toMatch(/applyQuickLogV2Refresh/);
    // Should not have the old standalone grow_events-only invalidation pattern
    // (the rule covers grow_events AND quick_log_grouped_timeline together)
    expect(body).not.toMatch(
      /invalidateQueries\s*\(\s*\{\s*queryKey:\s*\[\s*["']grow_events["']\s*\]\s*\}\s*\)\s*;\s*\n\s*window\.dispatchEvent/,
    );
  });

  it("still dispatches verdant:entry-created for global timeline", () => {
    const body = src(QUICK_LOG);
    expect(body).toMatch(/verdant:entry-created/);
  });

  it("passes to applyQuickLogV2Refresh with plant targetType and selectedPlant.id", () => {
    const body = src(QUICK_LOG);
    expect(body).toMatch(/targetType:\s*["']plant["']/);
    expect(body).toMatch(/targetId:\s*selectedPlant\.id/);
    expect(body).toMatch(/tentId:\s*selectedPlant\.tent_id\s*\?\?/);
  });

  it("does not write to new tables or invoke Edge Functions", () => {
    const body = src(QUICK_LOG);
    expect(body).not.toMatch(/from\(["']alerts["']\)/);
    expect(body).not.toMatch(/from\(["']action_queue["']\)/);
    expect(body).not.toMatch(/from\(["']sensor_readings["']\)/);
    expect(body).not.toMatch(/from\(["']ai_doctor_sessions["']\)/);
    expect(body).not.toMatch(/functions\.invoke/);
  });
});

describe("plant timeline invalidation — PlantQuickLog (plant detail button)", () => {
  it("calls applyQuickLogV2Refresh on successful save", () => {
    const body = src(PLANT_QUICK_LOG);
    expect(body).toMatch(/applyQuickLogV2Refresh\s*\(\s*queryClient/);
  });

  it("passes to applyQuickLogV2Refresh with plant targetType and plantId prop", () => {
    const body = src(PLANT_QUICK_LOG);
    expect(body).toMatch(/targetType:\s*["']plant["']/);
    expect(body).toMatch(/targetId:\s*plantId/);
    expect(body).toMatch(/tentId:\s*tentId\s*\?\?/);
  });

  it("still dispatches verdant:entry-created for global timeline", () => {
    const body = src(PLANT_QUICK_LOG);
    expect(body).toMatch(/verdant:entry-created/);
  });

  it("still writes only to diary_entries and diary-photos (no new table writes)", () => {
    const body = src(PLANT_QUICK_LOG);
    expect(body).toMatch(/from\(["']diary_entries["']\)/);
    expect(body).toMatch(/from\(["']diary-photos["']\)/);
    expect(body).not.toMatch(/from\(["']grow_events["']\)/);
    expect(body).not.toMatch(/from\(["']alerts["']\)/);
    expect(body).not.toMatch(/from\(["']action_queue["']\)/);
    expect(body).not.toMatch(/from\(["']sensor_readings["']\)/);
    expect(body).not.toMatch(/functions\.invoke/);
  });
});

describe("refresh rules coverage — quick_log_grouped_timeline always invalidated", () => {
  it("ALWAYS_KEYS includes quick_log_grouped_timeline", () => {
    const body = src(REFRESH_RULES);
    expect(body).toMatch(/["']quick_log_grouped_timeline["']/);
    // Confirm it's in the ALWAYS_KEYS block (appears before the conditional keys block)
    const alwaysIdx = body.indexOf("ALWAYS_KEYS");
    const qltIdx = body.indexOf('"quick_log_grouped_timeline"');
    expect(alwaysIdx).toBeGreaterThan(-1);
    expect(qltIdx).toBeGreaterThan(-1);
    expect(qltIdx).toBeGreaterThan(alwaysIdx);
  });

  it("applyQuickLogV2Refresh is exported from the rules module", () => {
    const body = src(REFRESH_RULES);
    expect(body).toMatch(/export\s+function\s+applyQuickLogV2Refresh/);
  });

  it("rules module is pure — no writes, no Supabase, no Edge Function calls", () => {
    const body = src(REFRESH_RULES);
    expect(body).not.toMatch(/\.insert\(/);
    expect(body).not.toMatch(/\.upsert\(/);
    expect(body).not.toMatch(/\.update\(/);
    expect(body).not.toMatch(/\.delete\(/);
    expect(body).not.toMatch(/\.rpc\(/);
    expect(body).not.toMatch(/functions\.invoke/);
    expect(body).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
  });
});
