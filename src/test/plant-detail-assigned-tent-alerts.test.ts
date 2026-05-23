/**
 * Plant Detail → Assigned Tent Alerts panel tests.
 *
 * Pure helper coverage + static source-level guardrails. Asserts:
 *  - Panel renders on Plant Detail
 *  - No assigned tent => assigned-tent empty state
 *  - Tent-scoped filtering, never crosses tents or grows
 *  - Closed/resolved/dismissed alerts are excluded
 *  - Highest severity first, deterministic tie-break
 *  - Cap respects limit, default 5
 *  - View Alert link points to /alerts/:id
 *  - No invented recommendations
 *  - No writes; safe (no service_role, no automation/device strings, no
 *    pi-ingest or edge function references)
 *  - Other Plant Detail surfaces remain wired
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT,
  buildAssignedTentAlerts,
} from "@/lib/plantAssignedTentAlertRules";
import type { AlertRow } from "@/lib/alerts";

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
    status: "open",
    first_seen_at: "2026-05-23T10:00:00Z",
    last_seen_at: "2026-05-23T10:00:00Z",
    acknowledged_at: null,
    resolved_at: null,
    created_at: "2026-05-23T10:00:00Z",
    updated_at: "2026-05-23T10:00:00Z",
    ...overrides,
  } as AlertRow;
}

describe("buildAssignedTentAlerts (pure)", () => {
  it("returns [] when no tentId", () => {
    expect(buildAssignedTentAlerts([alert()], { tentId: null })).toEqual([]);
    expect(buildAssignedTentAlerts([alert()], { tentId: undefined })).toEqual([]);
  });

  it("returns [] when no rows", () => {
    expect(buildAssignedTentAlerts([], { tentId: "t1" })).toEqual([]);
    expect(buildAssignedTentAlerts(null, { tentId: "t1" })).toEqual([]);
  });

  it("filters to the assigned tent only — never leaks other tents", () => {
    const rows = buildAssignedTentAlerts(
      [alert({ id: "a", tent_id: "t1" }), alert({ id: "b", tent_id: "t2" })],
      { tentId: "t1" },
    );
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("never crosses grows when growId provided", () => {
    const rows = buildAssignedTentAlerts(
      [
        alert({ id: "a", tent_id: "t1", grow_id: "g1" }),
        alert({ id: "b", tent_id: "t1", grow_id: "g2" }),
      ],
      { tentId: "t1", growId: "g1" },
    );
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("excludes resolved / dismissed alerts", () => {
    const rows = buildAssignedTentAlerts(
      [
        alert({ id: "o", status: "open" }),
        alert({ id: "r", status: "resolved" }),
        alert({ id: "d", status: "dismissed" }),
        alert({ id: "k", status: "acknowledged" }),
      ],
      { tentId: "t1" },
    );
    expect(rows.map((r) => r.id).sort()).toEqual(["k", "o"]);
  });

  it("orders highest severity first with deterministic tie-break", () => {
    const rows = buildAssignedTentAlerts(
      [
        alert({ id: "i", severity: "info" }),
        alert({ id: "c", severity: "critical" }),
        alert({ id: "w1", severity: "warning", last_seen_at: "2026-05-23T08:00:00Z" }),
        alert({ id: "w2", severity: "warning", last_seen_at: "2026-05-23T09:00:00Z" }),
        alert({ id: "wt", severity: "watch" }),
      ],
      { tentId: "t1" },
    );
    expect(rows.map((r) => r.id)).toEqual(["c", "w2", "w1", "wt", "i"]);
  });

  it("respects default cap of 5", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      alert({ id: `a${i}`, last_seen_at: `2026-05-${10 + (i % 10)}T00:00:00Z` }),
    );
    const rows = buildAssignedTentAlerts(many, { tentId: "t1" });
    expect(rows.length).toBe(ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT);
    expect(ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT).toBe(5);
  });

  it("respects custom limit", () => {
    const many = Array.from({ length: 8 }, (_, i) => alert({ id: `a${i}` }));
    const rows = buildAssignedTentAlerts(many, { tentId: "t1", limit: 3 });
    expect(rows.length).toBe(3);
  });

  it("does not invent recommendations or telemetry fields on the view row", () => {
    const [row] = buildAssignedTentAlerts([alert()], { tentId: "t1" });
    const json = JSON.stringify(row);
    expect(json).not.toContain("recommendation");
    expect(json).not.toContain("suggestion");
    for (const k of ["temperature_c", "humidity_pct", "vpd_kpa", "co2_ppm"]) {
      expect(json).not.toContain(`"${k}"`);
    }
  });

  it("preserves available alert fields without fabrication", () => {
    const [row] = buildAssignedTentAlerts(
      [alert({ metric: null, reason: "" })],
      { tentId: "t1" },
    );
    expect(row.metric).toBeNull();
    expect(row.reason).toBe("");
    expect(row.title).toBe("Temp high");
    expect(row.status).toBe("open");
    expect(row.severityLabel).toBe("Warning");
  });
});

// ---------- Static source-level guardrails ----------
const PANEL = read("src/components/PlantAssignedTentAlertsPanel.tsx");
const HOOK = read("src/hooks/usePlantAssignedTentAlerts.ts");
const RULES = read("src/lib/plantAssignedTentAlertRules.ts");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

describe("Plant Detail wiring", () => {
  it("PlantDetail renders the Assigned Tent Alerts panel", () => {
    expect(PLANT_DETAIL).toContain("PlantAssignedTentAlertsPanel");
  });
  it("panel View Alert link targets the existing /alerts/:id route", () => {
    expect(PANEL).toMatch(/\/alerts\/\$\{row\.id\}/);
  });
  it("panel shows the assigned-tent empty state copy", () => {
    expect(PANEL).toContain("Assign this plant to a tent to see tent alerts.");
  });
  it("panel shows the no-open-alerts empty state copy", () => {
    expect(PANEL).toContain("No open alerts for this assigned tent.");
  });
  it("hook queries the existing alerts source scoped to grow + open status", () => {
    expect(HOOK).toContain("useAlertsList");
    expect(HOOK).toMatch(/status:\s*["']open["']/);
    expect(HOOK).toMatch(/growId/);
  });
});

describe("Assigned Tent Alerts safety", () => {
  const ALL = [PANEL, HOOK, RULES].join("\n");

  it("never writes from the panel / hook / rules", () => {
    for (const src of [PANEL, HOOK, RULES]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });

  it("does not touch sensor_readings / action_queue / tents / plants / diary_entries via .from()", () => {
    for (const src of [PANEL, HOOK, RULES]) {
      for (const t of [
        "sensor_readings",
        "action_queue",
        "action_queue_events",
        "alert_events",
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
    expect(RULES).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
    expect(RULES).not.toMatch(/from\s+["']react["']/);
    expect(RULES).not.toMatch(/fetch\(/);
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
});
