/**
 * The manual "Save alert" block reason must describe the ACTUAL cause.
 *
 * `isSnapshotPersistable` can refuse for five distinct reasons. A single
 * catch-all explanation ("this reading is outside the window") misreports
 * provenance for a missing, simulated, or demo snapshot — telling the grower
 * their reading merely expired when it was never eligible at all. That is the
 * same class of relabelling the alert-freshness module exists to prevent.
 *
 * Pure. No I/O, no React, no clock reads (now is always injected).
 */
import { describe, it, expect } from "vitest";
import {
  snapshotPersistenceBlockReason,
  isSnapshotPersistable,
  type PersistenceBlockReason,
} from "@/lib/environmentAlertPersistence";
import {
  describeAlertSaveBlock,
  ALERT_SAVE_BLOCK_MESSAGE,
} from "@/lib/alertFreshnessContext";
import { MANUAL_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";

const NOW = new Date("2026-05-23T12:00:00Z").getTime();

function snap(overrides: Record<string, unknown> = {}): SensorSnapshot {
  return {
    ts: new Date(NOW - 60_000).toISOString(),
    source: "manual",
    temp: 24.5,
    rh: 78,
    vpd: 0.9,
    soil_ec: null,
    ppfd: null,
    ...overrides,
  } as unknown as SensorSnapshot;
}

describe("snapshotPersistenceBlockReason — the single ordered gate", () => {
  it("returns null for an eligible snapshot", () => {
    expect(snapshotPersistenceBlockReason({ snapshot: snap(), quality: "good", now: NOW })).toBe(
      null,
    );
  });

  it("names each distinct cause", () => {
    const cases: Array<[PersistenceBlockReason, Parameters<typeof snapshotPersistenceBlockReason>[0]]> =
      [
        ["demo_data", { snapshot: snap(), quality: "good", isDemoData: true, now: NOW }],
        ["no_snapshot", { snapshot: null, quality: "good", now: NOW }],
        ["context_only_source", { snapshot: snap({ source: "sim" }), quality: "good", now: NOW }],
        ["quality_unavailable", { snapshot: snap(), quality: "unavailable", now: NOW }],
        [
          "outside_live_window",
          {
            snapshot: snap({ ts: new Date(NOW - 20 * 60 * 1000).toISOString() }),
            quality: "good",
            now: NOW,
          },
        ],
      ];
    for (const [expected, ctx] of cases) {
      expect(snapshotPersistenceBlockReason(ctx), `expected reason ${expected}`).toBe(expected);
    }
  });

  it("isSnapshotPersistable agrees with the reason function for every case", () => {
    const ctxs = [
      { snapshot: snap(), quality: "good" as const, now: NOW },
      { snapshot: snap(), quality: "good" as const, isDemoData: true, now: NOW },
      { snapshot: null, quality: "good" as const, now: NOW },
      { snapshot: snap({ source: "diary" }), quality: "good" as const, now: NOW },
      { snapshot: snap(), quality: "unavailable" as const, now: NOW },
      {
        snapshot: snap({ ts: new Date(NOW - 20 * 60 * 1000).toISOString() }),
        quality: "good" as const,
        now: NOW,
      },
    ];
    for (const ctx of ctxs) {
      expect(isSnapshotPersistable(ctx)).toBe(snapshotPersistenceBlockReason(ctx) === null);
    }
  });
});

describe("describeAlertSaveBlock — honest operator copy", () => {
  it("returns null when saving is allowed", () => {
    expect(describeAlertSaveBlock({ snapshot: snap(), quality: "good", now: NOW })).toBe(null);
  });

  it("never explains a non-freshness block as a freshness problem", () => {
    // The regression this file exists for: a catch-all window message.
    const nonFreshness = [
      { snapshot: snap(), quality: "good" as const, isDemoData: true, now: NOW },
      { snapshot: null, quality: "good" as const, now: NOW },
      { snapshot: snap({ source: "sim" }), quality: "good" as const, now: NOW },
      { snapshot: snap(), quality: "unavailable" as const, now: NOW },
    ];
    for (const ctx of nonFreshness) {
      const msg = describeAlertSaveBlock(ctx);
      expect(msg).not.toBeNull();
      expect(msg, `"${msg}" wrongly blames the freshness window`).not.toMatch(
        /outside the .*alert window/i,
      );
    }
  });

  it("does explain an expired-but-otherwise-eligible reading as a window problem", () => {
    const msg = describeAlertSaveBlock({
      snapshot: snap({ ts: new Date(NOW - 20 * 60 * 1000).toISOString() }),
      quality: "good",
      now: NOW,
    });
    expect(msg).toMatch(/outside the .*alert window/i);
  });

  it("a manual reading inside the 24h display window still gets the window message", () => {
    // Current for display, not persistable — the grower needs to be told which.
    const msg = describeAlertSaveBlock({
      snapshot: snap({ ts: new Date(NOW - (MANUAL_CURRENT_STATE_STALE_MS - 60_000)).toISOString() }),
      quality: "good",
      now: NOW,
    });
    expect(msg).toMatch(/outside the .*alert window/i);
  });

  it("every block reason has a distinct message", () => {
    const messages = Object.values(ALERT_SAVE_BLOCK_MESSAGE);
    expect(new Set(messages).size).toBe(messages.length);
    for (const m of messages) expect(m.trim().length).toBeGreaterThan(0);
  });
});
