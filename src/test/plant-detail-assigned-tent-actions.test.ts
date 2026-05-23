/**
 * Plant Detail → Assigned Tent Action Queue panel tests.
 *
 * Pure helper coverage + static source-level guardrails. Asserts:
 *  - Panel renders on Plant Detail
 *  - No assigned tent => assigned-tent empty state
 *  - Tent-scoped filtering, never crosses tents or grows
 *  - Only pending_approval rows render (approved/rejected/completed
 *    /cancelled/simulated are excluded)
 *  - Newest first with deterministic tie-break
 *  - Cap respects default of 5
 *  - View Action link points to /actions/:id
 *  - Alert back-pointer `[alert:<id>]` is parsed (not invented)
 *  - Missing fields are preserved as null (not fabricated)
 *  - No writes; safe (no service_role, no automation/device strings, no
 *    pi-ingest or edge function references)
 *  - Existing Plant Detail surfaces remain wired
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ASSIGNED_TENT_ACTIONS_DEFAULT_LIMIT,
  buildAssignedTentActions,
  extractAlertBackPointerId,
  type AssignedTentActionInputRow,
} from "@/lib/plantAssignedTentActionRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

function action(
  overrides: Partial<AssignedTentActionInputRow> = {},
): AssignedTentActionInputRow {
  return {
    id: "act-1",
    grow_id: "g1",
    tent_id: "t1",
    plant_id: null,
    status: "pending_approval",
    source: "environment_alert",
    action_type: "advisory",
    target_metric: "humidity_pct",
    suggested_change: "Review humidity control and lower RH target gradually.",
    reason: "Humidity is high [alert:al-1]",
    risk_level: "high",
    created_at: "2026-05-23T10:00:00Z",
    ...overrides,
  };
}

describe("extractAlertBackPointerId", () => {
  it("parses the [alert:<id>] token", () => {
    expect(extractAlertBackPointerId("Humidity is high [alert:abc-123]")).toBe(
      "abc-123",
    );
  });
  it("returns null when no token present", () => {
    expect(extractAlertBackPointerId("no token")).toBeNull();
    expect(extractAlertBackPointerId(null)).toBeNull();
    expect(extractAlertBackPointerId(undefined)).toBeNull();
    expect(extractAlertBackPointerId("")).toBeNull();
  });
});

describe("buildAssignedTentActions (pure)", () => {
  it("returns [] when no tentId", () => {
    expect(buildAssignedTentActions([action()], { tentId: null })).toEqual([]);
    expect(buildAssignedTentActions([action()], { tentId: undefined })).toEqual([]);
  });

  it("returns [] when no rows", () => {
    expect(buildAssignedTentActions([], { tentId: "t1" })).toEqual([]);
    expect(buildAssignedTentActions(null, { tentId: "t1" })).toEqual([]);
  });

  it("filters to the assigned tent only — never leaks other tents", () => {
    const rows = buildAssignedTentActions(
      [
        action({ id: "a", tent_id: "t1" }),
        action({ id: "b", tent_id: "t2" }),
      ],
      { tentId: "t1" },
    );
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("never crosses grows when growId provided", () => {
    const rows = buildAssignedTentActions(
      [
        action({ id: "a", tent_id: "t1", grow_id: "g1" }),
        action({ id: "b", tent_id: "t1", grow_id: "g2" }),
      ],
      { tentId: "t1", growId: "g1" },
    );
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("excludes approved / rejected / completed / cancelled / simulated rows", () => {
    const rows = buildAssignedTentActions(
      [
        action({ id: "p", status: "pending_approval" }),
        action({ id: "a", status: "approved" }),
        action({ id: "r", status: "rejected" }),
        action({ id: "c", status: "completed" }),
        action({ id: "x", status: "cancelled" }),
        action({ id: "s", status: "simulated" }),
      ],
      { tentId: "t1" },
    );
    expect(rows.map((r) => r.id)).toEqual(["p"]);
    expect(rows[0].status).toBe("pending_approval");
  });

  it("orders newest first by created_at with deterministic tie-break", () => {
    const rows = buildAssignedTentActions(
      [
        action({ id: "old", created_at: "2026-05-20T00:00:00Z" }),
        action({ id: "newA", created_at: "2026-05-23T10:00:00Z" }),
        action({ id: "newB", created_at: "2026-05-23T10:00:00Z" }),
        action({ id: "mid", created_at: "2026-05-21T00:00:00Z" }),
      ],
      { tentId: "t1" },
    );
    expect(rows.map((r) => r.id)).toEqual(["newA", "newB", "mid", "old"]);
  });

  it("respects default cap of 5", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      action({ id: `a${i}`, created_at: `2026-05-${10 + (i % 10)}T00:00:00Z` }),
    );
    const rows = buildAssignedTentActions(many, { tentId: "t1" });
    expect(rows.length).toBe(ASSIGNED_TENT_ACTIONS_DEFAULT_LIMIT);
    expect(ASSIGNED_TENT_ACTIONS_DEFAULT_LIMIT).toBe(5);
  });

  it("respects custom limit", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      action({ id: `a${i}`, created_at: `2026-05-${10 + i}T00:00:00Z` }),
    );
    const rows = buildAssignedTentActions(many, { tentId: "t1", limit: 3 });
    expect(rows.length).toBe(3);
  });

  it("links to assigned tent alerts via the [alert:<id>] back-pointer", () => {
    const [row] = buildAssignedTentActions(
      [action({ reason: "RH high [alert:al-42]" })],
      { tentId: "t1" },
    );
    expect(row.alertBackPointerId).toBe("al-42");
  });

  it("does not invent fields when source row is sparse", () => {
    const [row] = buildAssignedTentActions(
      [
        action({
          source: null,
          action_type: null,
          target_metric: null,
          suggested_change: null,
          reason: null,
          risk_level: null,
          created_at: null,
        }),
      ],
      { tentId: "t1" },
    );
    expect(row.source).toBeNull();
    expect(row.actionType).toBeNull();
    expect(row.targetMetric).toBeNull();
    expect(row.suggestedChange).toBeNull();
    expect(row.reason).toBeNull();
    expect(row.riskLevel).toBeNull();
    expect(row.createdAt).toBeNull();
    expect(row.alertBackPointerId).toBeNull();
    // No invented recommendation / device fields.
    const json = JSON.stringify(row);
    expect(json).not.toContain("recommendation");
    expect(json).not.toContain("device_command");
  });

  it("drops rows missing id or grow_id defensively", () => {
    const rows = buildAssignedTentActions(
      [
        action({ id: "" }),
        action({ id: "ok", grow_id: null }),
        action({ id: "good" }),
      ],
      { tentId: "t1" },
    );
    expect(rows.map((r) => r.id)).toEqual(["good"]);
  });
});

// ---------- Static source-level guardrails ----------
const PANEL = read("src/components/PlantAssignedTentActionsPanel.tsx");
const HOOK = read("src/hooks/usePlantAssignedTentActions.ts");
const RULES = read("src/lib/plantAssignedTentActionRules.ts");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

describe("Plant Detail wiring", () => {
  it("PlantDetail renders the Assigned Tent Action Queue panel", () => {
    expect(PLANT_DETAIL).toContain("PlantAssignedTentActionsPanel");
  });
  it("panel View Action link targets the existing /actions/:id route", () => {
    expect(PANEL).toMatch(/\/actions\/\$\{row\.id\}/);
  });
  it("panel shows the assigned-tent empty state copy", () => {
    expect(PANEL).toContain(
      "Assign this plant to a tent to see pending actions.",
    );
  });
  it("panel shows the no-pending-actions empty state copy", () => {
    expect(PANEL).toContain("No pending actions for this assigned tent.");
  });
  it("hook queries action_queue scoped to tent + pending_approval status", () => {
    expect(HOOK).toMatch(/\.from\(\s*["']action_queue["']\s*\)/);
    expect(HOOK).toMatch(/status["'],\s*["']pending_approval["']/);
    expect(HOOK).toMatch(/tent_id/);
  });
});

describe("Assigned Tent Action Queue safety", () => {
  const ALL = [PANEL, HOOK, RULES].join("\n");

  it("never writes from the panel / hook / rules", () => {
    for (const src of [PANEL, HOOK, RULES]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });

  it("does not touch alerts / sensor_readings / tents / plants / diary_entries via .from()", () => {
    for (const src of [PANEL, HOOK, RULES]) {
      for (const t of [
        "sensor_readings",
        "alerts",
        "alert_events",
        "action_queue_events",
        "tents",
        "plants",
        "diary_entries",
        "pi_ingest_idempotency_keys",
        "pi_ingest_bridge_credentials",
      ]) {
        expect(src).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
      }
    }
  });

  it("contains no service_role / automation / device-control / pi-ingest transport strings", () => {
    expect(ALL).not.toMatch(
      /service_role|mqtt|home[\s_-]?assistant|relay|actuator|webhook|device_command|autopilot/i,
    );
  });

  it("does not reference Edge Functions or pi-ingest paths", () => {
    expect(ALL).not.toMatch(/supabase\/functions/);
    expect(ALL).not.toMatch(/pi-ingest/);
  });

  it("rules file has no React, no Supabase, no I/O", () => {
    expect(RULES).not.toMatch(
      /from\s+["']@\/integrations\/supabase\/client["']/,
    );
    expect(RULES).not.toMatch(/from\s+["']react["']/);
    expect(RULES).not.toMatch(/fetch\(/);
  });

  it("panel performs no approve/reject/execute mutations", () => {
    expect(PANEL).not.toMatch(/approve|reject|execute|simulate|complete|cancel/i);
  });
});

describe("Existing Plant Detail surfaces remain intact", () => {
  it("AssignTentDialog still rendered on Plant Detail", () => {
    expect(PLANT_DETAIL).toContain("AssignTentDialog");
  });
  it("PlantTentEnvironmentPanel still rendered on Plant Detail", () => {
    expect(PLANT_DETAIL).toContain("PlantTentEnvironmentPanel");
  });
  it("PlantRecentActivityPanel still rendered on Plant Detail", () => {
    expect(PLANT_DETAIL).toContain("PlantRecentActivityPanel");
  });
  it("PlantAssignedTentAlertsPanel still rendered on Plant Detail", () => {
    expect(PLANT_DETAIL).toContain("PlantAssignedTentAlertsPanel");
  });
});
