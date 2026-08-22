/**
 * One-Tent Loop alert-origin proof resolver tests.
 *
 * The generic originating-event adapter only makes persisted JSON safe to
 * render. This proof-specific resolver additionally requires an exact match
 * against the already-loaded, selected-tent snapshot provenance.
 */
import { describe, expect, it } from "vitest";

import { hasResolvedOneTentLoopAlertEvidence } from "@/lib/oneTentLoopAlertEvidenceRules";
import type { OriginatingTimelineEventRef } from "@/lib/originatingTimelineEventRules";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";

const TENT_ID = "tent-current";
const SENSOR_AT = "2026-06-09T11:55:00.000Z";
const DIARY_AT = "2026-06-09T11:40:00.000Z";

const INVALID_REFS: Array<[string, OriginatingTimelineEventRef]> = [
  [
    "foreign id",
    {
      id: "reading-rh-foreign",
      type: "sensor_snapshot",
      source: "live",
      occurred_at: SENSOR_AT,
    },
  ],
  [
    "mislabeled source",
    {
      id: "reading-rh-current",
      type: "sensor_snapshot",
      source: "manual",
      occurred_at: SENSOR_AT,
    },
  ],
  [
    "mislabeled kind",
    {
      id: "reading-rh-current",
      type: "diary_entry",
      source: "live",
      occurred_at: SENSOR_AT,
    },
  ],
  [
    "wrong occurrence time",
    {
      id: "reading-rh-current",
      type: "sensor_snapshot",
      source: "live",
      occurred_at: "2026-06-09T11:54:00.000Z",
    },
  ],
];

function snapshot(overrides: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    source: "live",
    ts: SENSOR_AT,
    temp: 24,
    rh: 58,
    vpd: null,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
    tent_id: TENT_ID,
    metric_refs: {
      rh: { id: "reading-rh-current", captured_at: SENSOR_AT, source: "live" },
      temp: { id: "reading-temp-current", captured_at: SENSOR_AT, source: "live" },
    },
    ...overrides,
  };
}

function resolves(
  refs: readonly OriginatingTimelineEventRef[],
  snapshotOverrides: Partial<SensorSnapshot> = {},
) {
  return hasResolvedOneTentLoopAlertEvidence({
    refs,
    snapshot: snapshot(snapshotOverrides),
    alert_metric: "rh",
    selected_tent_id: TENT_ID,
  });
}

describe("hasResolvedOneTentLoopAlertEvidence", () => {
  it("accepts the exact current selected-tent sensor metric reference", () => {
    expect(
      resolves([
        {
          id: "reading-rh-current",
          type: "sensor_snapshot",
          source: "live",
          occurred_at: SENSOR_AT,
        },
      ]),
    ).toBe(true);
  });

  it("accepts the exact selected-tent Environment Check diary reference", () => {
    expect(
      resolves(
        [
          {
            id: "diary-current",
            type: "diary_entry",
            source: "manual",
            occurred_at: DIARY_AT,
          },
        ],
        {
          source: "manual",
          metric_refs: undefined,
          diary_evidence_ref: { id: "diary-current", entry_at: DIARY_AT },
        },
      ),
    ).toBe(true);
  });

  it.each(INVALID_REFS)("fails closed for a %s ref", (_label, ref) => {
    expect(resolves([ref])).toBe(false);
  });

  it("fails closed when the selected snapshot is attributed to a different tent", () => {
    expect(
      resolves(
        [
          {
            id: "reading-rh-current",
            type: "sensor_snapshot",
            source: "live",
            occurred_at: SENSOR_AT,
          },
        ],
        { tent_id: "tent-foreign" },
      ),
    ).toBe(false);
  });
});
