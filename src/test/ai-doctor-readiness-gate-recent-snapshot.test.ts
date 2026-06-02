/**
 * Req-1 regression: a manual sensor snapshot inside the 48h fresh window
 * (and inside the 7d recent window) must:
 *   (a) NOT be listed in `result.missing` as `recent-manual-sensor-snapshot`
 *   (b) NOT produce a quick-action that asks to add a manual snapshot
 *
 * This is the trust-critical gate the readiness UI depends on.
 */
import { describe, it, expect } from "vitest";
import { evaluateAiDoctorContext } from "@/lib/aiDoctorContextRules";
import { buildAiDoctorContextQuickActions } from "@/lib/aiDoctorContextQuickActionsViewModel";

const NOW = Date.parse("2026-02-01T12:00:00.000Z");
const HOUR = 3600 * 1000;

describe("AI Doctor Readiness Gate — snapshot inside 48h fresh window", () => {
  it("recent snapshot clears its own missing row and quick action", () => {
    const result = evaluateAiDoctorContext({
      plant: {
        hasProfile: true,
        strain: "NL Auto",
        stage: "veg",
        medium: "soil",
        hasPlantPhoto: true,
      },
      recentEvents: [
        { at: new Date(NOW - 6 * HOUR).toISOString(), category: "notes" },
        { at: new Date(NOW - 24 * HOUR).toISOString(), category: "watering" },
      ],
      recentManualSnapshots: [
        { at: new Date(NOW - 12 * HOUR).toISOString(), severity: "ok" },
      ],
      now: NOW,
    });

    expect(result.missing).not.toContain("recent-manual-sensor-snapshot");
    expect(result.evidence).toContain("recent-manual-sensor-snapshot");
    expect(result.evidence).toContain("fresh-manual-sensor-snapshot");

    const actions = buildAiDoctorContextQuickActions({
      missing: result.missing,
      plantId: "p1",
      plantName: "Plant A",
      growId: "g1",
    });
    expect(actions.some((a) => a.kind === "add_manual_sensor_snapshot")).toBe(false);
  });
});
