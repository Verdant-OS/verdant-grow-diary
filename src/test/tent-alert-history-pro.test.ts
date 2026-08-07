/**
 * Tent alert history (Pro) — pure rules + static wiring.
 *
 * Closed rows are already in the all-status alerts payload; history only
 * presents them behind tent_alert_history. No schema, no second read contract
 * on the plant surface (parent passes historyRows).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ASSIGNED_TENT_ALERT_HISTORY_DEFAULT_LIMIT,
  buildAssignedTentAlertHistory,
  buildAssignedTentAlerts,
  tentAlertHistoryClosureLabel,
} from "@/lib/plantAssignedTentAlertRules";
import { FEATURE_KEYS, canUseFeature } from "@/lib/featureEntitlements";
import type { AlertRow } from "@/lib/alerts";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

function alert(overrides: Partial<AlertRow> = {}): AlertRow {
  return {
    id: "a1",
    user_id: "u1",
    grow_id: "g1",
    tent_id: "t1",
    plant_id: null,
    source: "environment_alerts",
    severity: "warning",
    metric: "temperature",
    title: "Temp high",
    reason: "Above target",
    status: "resolved",
    first_seen_at: "2026-05-23T10:00:00Z",
    last_seen_at: "2026-05-23T12:00:00Z",
    acknowledged_at: null,
    resolved_at: "2026-05-23T12:30:00Z",
    created_at: "2026-05-23T10:00:00Z",
    updated_at: "2026-05-23T12:30:00Z",
    originating_timeline_events: [],
    ...overrides,
  } as AlertRow;
}

function ent(plan: ResolvedEntitlement["effectivePlanId"], active = true): ResolvedEntitlement {
  return {
    effectivePlanId: plan,
    displayPlanId: plan,
    status: active ? "active" : "canceled",
    isActive: active,
    capabilities: {
      maxActiveGrows: null,
      aiCreditsPerGrow: null,
      aiMonthlyCredits: 100,
      liveSensors: true,
      advancedExports: true,
      multiTent: true,
      sensorHistoryDays: null,
      prioritySupport: true,
      blueprint: plan.startsWith("craft") || plan === "founder_lifetime",
    },
    degraded: !active,
    degradedReason: active ? null : "canceled",
    isStaff: false,
  };
}

describe("buildAssignedTentAlertHistory", () => {
  it("keeps only resolved/dismissed for the tent", () => {
    const rows = buildAssignedTentAlertHistory(
      [
        alert({ id: "o", status: "open", resolved_at: null }),
        alert({ id: "r", status: "resolved" }),
        alert({ id: "d", status: "dismissed", resolved_at: null }),
        alert({ id: "x", status: "resolved", tent_id: "t2" }),
      ],
      { tentId: "t1" },
    );
    expect(rows.map((r) => r.id).sort()).toEqual(["d", "r"]);
  });

  it("sorts newest closed first", () => {
    const rows = buildAssignedTentAlertHistory(
      [
        alert({ id: "old", resolved_at: "2026-05-20T00:00:00Z" }),
        alert({ id: "new", resolved_at: "2026-05-24T00:00:00Z" }),
      ],
      { tentId: "t1" },
    );
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("caps at default history limit", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      alert({
        id: `h${i}`,
        resolved_at: `2026-05-${String(10 + (i % 18)).padStart(2, "0")}T00:00:00Z`,
      }),
    );
    expect(buildAssignedTentAlertHistory(many, { tentId: "t1" }).length).toBe(
      ASSIGNED_TENT_ALERT_HISTORY_DEFAULT_LIMIT,
    );
  });

  it("does not invent fix recommendations", () => {
    const [row] = buildAssignedTentAlertHistory([alert()], { tentId: "t1" });
    const json = JSON.stringify(row);
    expect(json).not.toContain("recommendation");
    expect(json).not.toMatch(/auto.?fix|device|relay/i);
    expect(row.resolvedAt).toBe("2026-05-23T12:30:00Z");
  });
});

describe("open vs history split from one payload", () => {
  it("open builder still excludes closed; history excludes open", () => {
    const payload = [
      alert({ id: "o", status: "open", resolved_at: null }),
      alert({ id: "r", status: "resolved" }),
    ];
    expect(buildAssignedTentAlerts(payload, { tentId: "t1" }).map((r) => r.id)).toEqual(["o"]);
    expect(buildAssignedTentAlertHistory(payload, { tentId: "t1" }).map((r) => r.id)).toEqual([
      "r",
    ]);
  });
});

describe("tent_alert_history entitlement", () => {
  it("is a registered Pro feature key", () => {
    expect(FEATURE_KEYS).toContain("tent_alert_history");
  });
  it("unlocks for active Pro; free stays locked", () => {
    expect(canUseFeature(ent("pro_monthly"), "tent_alert_history")).toBe(true);
    expect(canUseFeature(ent("free"), "tent_alert_history")).toBe(false);
    expect(canUseFeature(null, "tent_alert_history")).toBe(false);
  });
});

describe("closure labels", () => {
  it("never claims device resolution", () => {
    expect(tentAlertHistoryClosureLabel("resolved")).toBe("Resolved");
    expect(tentAlertHistoryClosureLabel("dismissed")).toBe("Dismissed");
    expect(tentAlertHistoryClosureLabel("resolved").toLowerCase()).not.toMatch(/auto|device/);
  });
});

describe("wiring + safety (static)", () => {
  const PANEL = read("src/components/TentAlertHistoryPanel.tsx");
  const PLANT_PANEL = read("src/components/PlantAssignedTentAlertsPanel.tsx");
  const HOOK = read("src/hooks/usePlantAssignedTentAlerts.ts");
  const TENT = read("src/pages/TentDetail.tsx");
  const FEATURES = read("src/lib/featureEntitlements.ts");

  it("hooks one all-status alerts read", () => {
    expect(HOOK).toMatch(/status:\s*["']all["']/);
    expect(HOOK).toContain("buildAssignedTentAlertHistory");
  });

  it("plant panel shares historyRows (no second fetch contract)", () => {
    expect(PLANT_PANEL).toContain("TentAlertHistoryPanel");
    expect(PLANT_PANEL).toMatch(/historyRows=\{historyRows\}/);
  });

  it("Tent Detail mounts history panel", () => {
    expect(TENT).toContain("TentAlertHistoryPanel");
  });

  it("gates on tent_alert_history feature key", () => {
    expect(PANEL).toMatch(/tent_alert_history/);
    expect(FEATURES).toMatch(/tent_alert_history/);
  });

  it("presenter is read-only and device-free", () => {
    expect(PANEL).not.toMatch(/\.insert\(|\.update\(|\.delete\(|service_role|mqtt|actuator/i);
  });
});
