/**
 * Adapter tests for the strip's `variant` copy contract.
 *
 * The `context` variant is for surfaces that show the latest tent reading
 * as read-only context and never attach it to the saved log (Quick Log v2).
 * Its copy must never promise attachment ("This log will include…") or
 * reference the legacy "Attach sensor snapshot" toggle, while the shared
 * stale/invalid honesty copy stays identical across variants.
 */
import { describe, it, expect } from "vitest";
import { buildQuickLogStripFromTentState } from "@/lib/quickLogSnapshotStripAdapter";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot as StrictSensorSnapshot,
} from "@/lib/latestSensorSnapshotRules";

const NOW = new Date("2026-06-02T12:00:00Z");
const FIVE_MIN_AGO = "2026-06-02T11:55:00Z";

function fullSnapshot(partial: Partial<StrictSensorSnapshot> = {}): StrictSensorSnapshot {
  const base: StrictSensorSnapshot = {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "snap-1",
    tent_id: "t1",
    captured_at: FIVE_MIN_AGO,
    age_minutes: 5,
    source: "live",
    confidence: null,
    freshness: "fresh",
    status: "fresh_live",
    badge_label: "Live • as of 5 min ago • source: live",
    metrics: {
      temp_f: 75.74,
      humidity_pct: 55,
      vpd_kpa: 1.12,
      soil_moisture_pct: null,
      co2_ppm: null,
    },
    metricDetails: { ...EMPTY_SENSOR_SNAPSHOT.metricDetails },
    warnings: [],
    usable: true,
  };
  return { ...base, ...partial };
}

function build(overrides: Partial<Parameters<typeof buildQuickLogStripFromTentState>[0]> = {}) {
  return buildQuickLogStripFromTentState({
    status: "ready",
    snapshot: fullSnapshot(),
    hasTent: true,
    now: NOW,
    ...overrides,
  });
}

describe("quickLogSnapshotStripAdapter — context variant copy contract", () => {
  it("context + usable → context-only copy, no attachment promise", () => {
    const v = build({ variant: "context" });
    expect(v.status).toBe("usable");
    expect(v.title).toBe("Sensor context ready");
    expect(v.description).toBe("Latest tent reading, shown for context only.");
    expect(v.description).not.toMatch(/will include/i);
  });

  it("context + no_data → title drops the 'attached' framing", () => {
    const v = build({ variant: "context", hasTent: false });
    expect(v.status).toBe("no_data");
    expect(v.title).toBe("No sensor snapshot");
    expect(v.title).not.toMatch(/attached/i);
    // The add-a-snapshot guidance is attachment-neutral and stays shared.
    expect(v.description).toBe("Add a snapshot so this log has room context.");
    expect(v.action.kind).toBe("add");
  });

  it("context + stale keeps the shared honesty copy and refresh action", () => {
    const attach = build({ snapshot: fullSnapshot({ status: "stale", freshness: "stale" }) });
    const context = build({
      snapshot: fullSnapshot({ status: "stale", freshness: "stale" }),
      variant: "context",
    });
    expect(context.status).toBe("stale");
    expect(context.title).toBe(attach.title);
    expect(context.description).toBe(attach.description);
    expect(context.action).toEqual(attach.action);
  });

  it("context + invalid keeps the shared honesty copy and review action", () => {
    const attach = build({ snapshot: fullSnapshot({ status: "invalid", usable: false }) });
    const context = build({
      snapshot: fullSnapshot({ status: "invalid", usable: false }),
      variant: "context",
    });
    expect(context.status).toBe("invalid");
    expect(context.title).toBe(attach.title);
    expect(context.description).toBe(attach.description);
    expect(context.action).toEqual(attach.action);
  });

  it("context ignores attached=false — the toggle does not exist on context surfaces", () => {
    const v = build({ variant: "context", attached: false });
    expect(v.title).toBe("Sensor context ready");
    expect(v.description).not.toMatch(/Attach sensor snapshot/i);
    expect(v.description).toBe("Latest tent reading, shown for context only.");
  });

  it("variant omitted → attach behavior byte-identical (back-compat)", () => {
    const v = build();
    expect(v.title).toBe("Sensor context ready");
    expect(v.description).toBe("This log will include current sensor context.");
  });
});
