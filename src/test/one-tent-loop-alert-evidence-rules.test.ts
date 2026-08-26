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
import { buildSensorSnapshotEvidenceRefs } from "@/lib/sensorSnapshotEvidenceRefRules";

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

function metricRefs(source: string) {
  return {
    rh: { id: "reading-rh-current", captured_at: SENSOR_AT, source },
  };
}

const PI_BRIDGE_UNKNOWN_REF: OriginatingTimelineEventRef = {
  id: "reading-rh-current",
  type: "sensor_snapshot",
  // The shared timeline adapter historically normalizes the raw Pi bridge
  // transport label to unknown. The proof resolver must only accept that
  // legacy form when the selected current snapshot independently proves the
  // exact row is verified live Pi-bridge provenance.
  source: "unknown",
  occurred_at: SENSOR_AT,
};

function resolvesPiBridgeEvidence(
  ref: OriginatingTimelineEventRef,
  snapshotOverrides: Partial<SensorSnapshot> = {},
  selectedTentId = TENT_ID,
) {
  return hasResolvedOneTentLoopAlertEvidence({
    refs: [ref],
    snapshot: snapshot({
      source: "live",
      metric_refs: metricRefs("pi_bridge"),
      ...snapshotOverrides,
    }),
    alert_metric: "rh",
    selected_tent_id: selectedTentId,
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

  it("resolves the exact legacy-normalized Pi bridge ref from the current writer", () => {
    const persistedRefs = buildSensorSnapshotEvidenceRefs({
      id: "reading-rh-current",
      captured_at: SENSOR_AT,
      source: "pi_bridge",
      metric: "rh",
    });

    // This is the actual writer/reader representation today: the generic
    // timeline ref normalizer has no Pi bridge label and emits unknown.
    expect(persistedRefs).toEqual([PI_BRIDGE_UNKNOWN_REF]);
    expect(resolvesPiBridgeEvidence(persistedRefs[0]!)).toBe(true);
  });

  it("also accepts the canonical live Pi bridge ref when source normalization catches up", () => {
    expect(
      resolvesPiBridgeEvidence({
        ...PI_BRIDGE_UNKNOWN_REF,
        source: "live",
      }),
    ).toBe(true);
  });

  it.each([
    ["different ref source", { ...PI_BRIDGE_UNKNOWN_REF, source: "manual" }],
    ["different sensor row id", { ...PI_BRIDGE_UNKNOWN_REF, id: "reading-rh-foreign" }],
    [
      "different captured time",
      { ...PI_BRIDGE_UNKNOWN_REF, occurred_at: "2026-06-09T11:54:00.000Z" },
    ],
    ["different ref kind", { ...PI_BRIDGE_UNKNOWN_REF, type: "diary_entry" }],
  ] as const)("fails closed for Pi bridge legacy evidence with a %s", (_label, ref) => {
    expect(resolvesPiBridgeEvidence(ref)).toBe(false);
  });

  it.each(["ecowitt", "untrusted_bridge_v2"])(
    "does not promote an unknown ref from unverified raw source %s",
    (source) => {
      expect(
        resolvesPiBridgeEvidence(PI_BRIDGE_UNKNOWN_REF, {
          source: "live",
          metric_refs: metricRefs(source),
        }),
      ).toBe(false);
    },
  );

  it("does not promote an unknown Pi bridge ref when the selected snapshot is not live", () => {
    expect(
      resolvesPiBridgeEvidence(PI_BRIDGE_UNKNOWN_REF, {
        source: "manual",
      }),
    ).toBe(false);
  });

  it("does not promote an unknown Pi bridge ref across selected tents", () => {
    expect(resolvesPiBridgeEvidence(PI_BRIDGE_UNKNOWN_REF, {}, "tent-foreign")).toBe(false);
  });

  it.each(["live", "manual", "csv"] as const)(
    "preserves exact trusted %s metric-ref matching",
    (source) => {
      expect(
        resolves(
          [
            {
              id: "reading-rh-current",
              type: "sensor_snapshot",
              source,
              occurred_at: SENSOR_AT,
            },
          ],
          {
            source,
            metric_refs: metricRefs(source),
          },
        ),
      ).toBe(true);
    },
  );

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

  it.each([
    ["missing", null],
    ["unknown", "leaf_wetness"],
  ])(
    "fails closed for a manual Environment Check diary ref when the alert metric is %s",
    (_label, alertMetric) => {
      expect(
        hasResolvedOneTentLoopAlertEvidence({
          refs: [
            {
              id: "diary-current",
              type: "diary_entry",
              source: "manual",
              occurred_at: DIARY_AT,
            },
          ],
          snapshot: snapshot({
            source: "manual",
            metric_refs: undefined,
            diary_evidence_ref: { id: "diary-current", entry_at: DIARY_AT },
          }),
          alert_metric: alertMetric,
          selected_tent_id: TENT_ID,
        }),
      ).toBe(false);
    },
  );

  it("fails closed for a manual Environment Check diary ref without a finite value for its alert metric", () => {
    expect(
      hasResolvedOneTentLoopAlertEvidence({
        refs: [
          {
            id: "diary-current",
            type: "diary_entry",
            source: "manual",
            occurred_at: DIARY_AT,
          },
        ],
        snapshot: snapshot({
          source: "manual",
          rh: null,
          metric_refs: undefined,
          diary_evidence_ref: { id: "diary-current", entry_at: DIARY_AT },
        }),
        alert_metric: "rh",
        selected_tent_id: TENT_ID,
      }),
    ).toBe(false);
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
