/**
 * Additional refresh-rule coverage for AI Doctor readiness/context and
 * tent-scoped invalidation, plus static-safety guarantees.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildQuickLogV2RefreshQueryKeys,
  type QuickLogV2RefreshScope,
} from "@/lib/quickLogV2RefreshRules";

function flatten(keys: ReadonlyArray<ReadonlyArray<unknown>>): string[] {
  return keys.map((k) => JSON.stringify(k));
}

describe("buildQuickLogV2RefreshQueryKeys — AI Doctor + tent scoping", () => {
  it("plant target invalidates AI Doctor readiness/context for that plant", () => {
    const scope: QuickLogV2RefreshScope = {
      targetType: "plant",
      targetId: "plant-9",
      tentId: "tent-2",
    };
    const out = flatten(buildQuickLogV2RefreshQueryKeys(scope));
    expect(out).toContain(JSON.stringify(["ai_doctor_readiness", "plant-9"]));
    expect(out).toContain(JSON.stringify(["ai_doctor_context", "plant-9"]));
  });

  it("plant target with a tent also invalidates tent grouped/recent keys", () => {
    const out = flatten(
      buildQuickLogV2RefreshQueryKeys({
        targetType: "plant",
        targetId: "plant-9",
        tentId: "tent-2",
      }),
    );
    expect(out).toContain(
      JSON.stringify(["quick_log_grouped_timeline", "tent-2"]),
    );
    expect(out).toContain(JSON.stringify(["tent_recent_activity", "tent-2"]));
  });

  it("plant target without a tent does NOT emit tent-scoped keys", () => {
    const out = flatten(
      buildQuickLogV2RefreshQueryKeys({
        targetType: "plant",
        targetId: "plant-9",
        tentId: null,
      }),
    );
    expect(out.some((s) => s.startsWith('["tent_recent_activity"'))).toBe(false);
    expect(
      out.some(
        (s) =>
          s.startsWith('["quick_log_grouped_timeline"') &&
          s !== JSON.stringify(["quick_log_grouped_timeline"]),
      ),
    ).toBe(false);
  });

  it("tent target scopes grouped timeline + recent activity to the tent", () => {
    const out = flatten(
      buildQuickLogV2RefreshQueryKeys({
        targetType: "tent",
        targetId: "tent-77",
        tentId: "tent-77",
      }),
    );
    expect(out).toContain(
      JSON.stringify(["quick_log_grouped_timeline", "tent-77"]),
    );
    expect(out).toContain(JSON.stringify(["tent_recent_activity", "tent-77"]));
    // Tent-scoped readiness/context are emitted; conditional apply layer
    // skips them if no tent-scoped readiness query is mounted.
    expect(out).toContain(JSON.stringify(["ai_doctor_readiness", "tent-77"]));
    expect(out).toContain(JSON.stringify(["ai_doctor_context", "tent-77"]));
  });

  it("always includes dashboard recent activity / memory prefixes", () => {
    const out = flatten(
      buildQuickLogV2RefreshQueryKeys({
        targetType: "tent",
        targetId: "tent-1",
        tentId: "tent-1",
      }),
    );
    expect(out).toContain(JSON.stringify(["dashboard_recent_activity"]));
    expect(out).toContain(JSON.stringify(["dashboard_memory"]));
  });
});

describe("quickLogV2RefreshRules — static safety", () => {
  const file = readFileSync(
    join(process.cwd(), "src/lib/quickLogV2RefreshRules.ts"),
    "utf8",
  );

  it("performs no I/O, schema, RPC, or write operations", () => {
    expect(file).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(file).not.toMatch(/\.rpc\(/);
    expect(file).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(file).not.toMatch(/fetch\(|XMLHttpRequest/);
  });

  it("does not touch alerts, action_queue, or ai_doctor_sessions writes", () => {
    expect(file).not.toMatch(/alerts/i);
    expect(file).not.toMatch(/action_queue/i);
    expect(file).not.toMatch(/ai_doctor_sessions/);
  });

  it("uses no device-control or live/synced/connected/imported wording", () => {
    expect(file).not.toMatch(/\b(autopilot|device[-_ ]?control|actuator)\b/i);
    expect(file).not.toMatch(/\b(live|synced|connected|imported)\b/i);
  });
});
