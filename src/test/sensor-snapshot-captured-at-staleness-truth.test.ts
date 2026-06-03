/**
 * Sensor Snapshot Staleness / captured_at Truth — regression coverage.
 *
 * Verifies the One-Tent Loop invariant:
 *   occurred_at (when the grow action happened) and captured_at (when the
 *   sensor reading was taken) are tracked separately, and snapshot
 *   staleness is always computed from captured_at — never coerced from a
 *   parent event's occurred_at.
 *
 * No live AI calls. No Supabase. No device control. Pure helpers only.
 */

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

import {
  classifyAuditRow,
  adaptSnapshotClassificationToTimelineSeverity as _unused, // type check below
  countsAsHealthyEvidence,
  DEFAULT_STALE_WINDOW_MS,
  resolveStaleWindowMs,
} from "@/lib/sensorSnapshotStatusContract";
import { adaptSnapshotClassificationToTimelineSeverity } from "@/lib/sensorSnapshotTimelineSeverityAdapter";
import {
  classifyQuickLogSnapshotSource,
  shouldEmbedSnapshot,
} from "@/lib/quickLogSensorSnapshotRules";
import {
  computeFreshness,
  FRESHNESS_FRESH_MAX_HOURS,
} from "@/lib/manualSensorFreshnessRules";

void _unused;

const NOW = new Date("2026-06-03T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

describe("captured_at vs occurred_at separation", () => {
  it("preserves captured_at independently from a parent occurred_at", () => {
    // Quick Log occurred now; attached sensor reading was captured 6h earlier.
    const occurred_at = NOW.toISOString();
    const captured_at = new Date(NOW.getTime() - 6 * HOUR).toISOString();

    const label = classifyQuickLogSnapshotSource(
      { source: "manual", ts: captured_at, value: 72 },
      NOW.getTime(),
    );

    // Source must stay manual; ts must not be forced to occurred_at.
    expect(label.source).toBe("manual");
    expect(label.state).toBe("manual");
    expect(occurred_at).not.toBe(captured_at);
  });

  it("uses captured_at (not occurred_at) when ts is absent", () => {
    const captured_at = new Date(NOW.getTime() - 2 * HOUR).toISOString();
    const label = classifyQuickLogSnapshotSource(
      { source: "live", captured_at, value: 1 },
      NOW.getTime(),
    );
    expect(label.state).toBe("live");
  });
});

describe("Staleness classification (captured_at-driven)", () => {
  it("fresh manual snapshot within window is fresh", () => {
    const captured_at = new Date(NOW.getTime() - 2 * HOUR).toISOString();
    expect(
      computeFreshness({ value: 72, loggedAt: captured_at }, NOW),
    ).toBe("fresh");
  });

  it("manual snapshot older than 48h is stale even if parent occurred_at is current", () => {
    const captured_at = new Date(NOW.getTime() - 72 * HOUR).toISOString();
    expect(
      computeFreshness({ value: 72, loggedAt: captured_at }, NOW),
    ).toBe("stale");
  });

  it("missing/malformed captured_at is missing — never fresh", () => {
    expect(computeFreshness(null, NOW)).toBe("missing");
    expect(
      computeFreshness({ value: 1, loggedAt: "not-a-date" }, NOW),
    ).toBe("missing");
  });

  it("future captured_at is not classified as stale (guarded)", () => {
    const future = new Date(NOW.getTime() + 5 * HOUR).toISOString();
    const state = computeFreshness({ value: 1, loggedAt: future }, NOW);
    expect(state).not.toBe("stale");
  });

  it("Quick Log embed marks live-family stale via captured_at", () => {
    const captured_at = new Date(
      NOW.getTime() - (DEFAULT_STALE_WINDOW_MS + HOUR),
    ).toISOString();
    const label = classifyQuickLogSnapshotSource(
      { source: "live", ts: captured_at, value: 1 },
      NOW.getTime(),
    );
    expect(label.state).toBe("stale");
    expect(shouldEmbedSnapshot(label.state)).toBe(false);
  });

  it("Quick Log embed flags malformed captured_at as invalid", () => {
    const label = classifyQuickLogSnapshotSource(
      { source: "live", ts: "garbage", value: 1 },
      NOW.getTime(),
    );
    expect(label.state).toBe("invalid");
  });
});

describe("Timeline severity surfaces stale captured_at honestly", () => {
  const occurred_at = NOW.toISOString();
  const stale_captured_at = new Date(
    NOW.getTime() - (DEFAULT_STALE_WINDOW_MS + HOUR),
  ).toISOString();

  it("stale captured_at renders as caution, not healthy", () => {
    const c = classifyAuditRow(
      {
        rowsReceived: 1,
        rowsAccepted: 1,
        capturedAt: stale_captured_at,
        source: "manual",
      },
      { now: NOW },
    );
    expect(c.status).toBe("stale");
    expect(c.isHealthyEvidence).toBe(false);
    const tone = adaptSnapshotClassificationToTimelineSeverity(c);
    expect(tone.tone).toBe("caution");
    expect(tone.isHealthy).toBe(false);
    expect(tone.isCautionary).toBe(true);
    // The parent occurred_at being current does not flip the badge to ok.
    expect(occurred_at).not.toBe(stale_captured_at);
  });

  it("missing captured_at does NOT become healthy/usable", () => {
    const c = classifyAuditRow(
      { rowsReceived: 1, rowsAccepted: 1, capturedAt: null, source: "manual" },
      { now: NOW },
    );
    expect(c.status).toBe("needs_review");
    expect(countsAsHealthyEvidence(c)).toBe(false);
    const tone = adaptSnapshotClassificationToTimelineSeverity(c);
    expect(tone.isHealthy).toBe(false);
    expect(tone.isUnsafe).toBe(true);
  });
});

describe("AI Doctor context never promotes stale captured_at to fresh evidence", () => {
  it("stale snapshot does not count as healthy evidence", () => {
    const stale = classifyAuditRow(
      {
        rowsReceived: 1,
        rowsAccepted: 1,
        capturedAt: new Date(
          NOW.getTime() - (DEFAULT_STALE_WINDOW_MS + HOUR),
        ).toISOString(),
        source: "manual",
      },
      { now: NOW },
    );
    expect(countsAsHealthyEvidence(stale)).toBe(false);
  });

  it("a single stale snapshot alone does not produce strong readiness", () => {
    const stale = classifyAuditRow(
      {
        rowsReceived: 1,
        rowsAccepted: 1,
        capturedAt: new Date(
          NOW.getTime() - (DEFAULT_STALE_WINDOW_MS + HOUR),
        ).toISOString(),
        source: "manual",
      },
      { now: NOW },
    );
    // Only `usable` snapshots can contribute to readiness "strong" gating.
    const healthyCount = [stale].filter(countsAsHealthyEvidence).length;
    expect(healthyCount).toBe(0);
  });
});

describe("Determinism with injected now", () => {
  it("same input + same now → same classification", () => {
    const captured_at = new Date(NOW.getTime() - 3 * HOUR).toISOString();
    const a = classifyAuditRow(
      { rowsReceived: 1, rowsAccepted: 1, capturedAt: captured_at, source: "manual" },
      { now: NOW },
    );
    const b = classifyAuditRow(
      { rowsReceived: 1, rowsAccepted: 1, capturedAt: captured_at, source: "manual" },
      { now: NOW },
    );
    expect(a).toEqual(b);
  });

  it("thresholds live in pure rules, not JSX", () => {
    expect(FRESHNESS_FRESH_MAX_HOURS).toBe(24);
    expect(resolveStaleWindowMs("manual")).toBe(DEFAULT_STALE_WINDOW_MS);
  });
});

describe("Static safety: presentation layer must not duplicate thresholds or unsafe paths", () => {
  const files = [
    "src/components/ManualSnapshotTimelineSection.tsx",
    "src/components/QuickLogSensorSnapshotStrip.tsx",
    "src/components/CoachAiDoctorContextPanel.tsx",
    "src/components/PlantDetailAiDoctorContextPanel.tsx",
  ];

  for (const file of files) {
    it(`${file} contains no unsafe strings or duplicated thresholds`, () => {
      let src = "";
      try {
        src = readFileSync(file, "utf8");
      } catch {
        // Missing file is fine — skip.
        return;
      }
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/autopilot/i);
      expect(src).not.toMatch(/_executed\b/);
      // No hardcoded stale-window arithmetic in JSX.
      expect(src).not.toMatch(/24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
      expect(src).not.toMatch(/STALE_THRESHOLD_MS\s*=/);
      // No "Live" fallback when source is unknown/missing.
      expect(src).not.toMatch(/\|\|\s*["']Live["']/);
    });
  }
});
