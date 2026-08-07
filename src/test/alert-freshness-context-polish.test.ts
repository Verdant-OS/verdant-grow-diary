import { describe, it, expect } from "vitest";
import {
  buildSourceChip,
  duplicateReassuranceCopy,
  emptyStateSnapshotCta,
  SOURCE_ELIGIBILITY_HELP,
} from "@/lib/alertFreshnessContext";
import { STALE_THRESHOLD_MS, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { MANUAL_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";

const NOW = Date.parse("2026-06-23T12:00:00Z");
const FRESH_TS = new Date(NOW - 5 * 60_000).toISOString();
// Staleness is source-aware since the #592 canon: live 15m, manual 24h.
// STALE_THRESHOLD_MS is the *live* window, so a timestamp derived from it is
// stale for live and deliberately current for manual. Derive each from its own
// window instead of reusing one for both.
const STALE_TS = new Date(NOW - STALE_THRESHOLD_MS - 60_000).toISOString();
const MANUAL_STALE_TS = new Date(NOW - MANUAL_CURRENT_STATE_STALE_MS - 60_000).toISOString();
const staleTsFor = (source: "manual" | "live") =>
  source === "manual" ? MANUAL_STALE_TS : STALE_TS;

function snap(
  overrides: Partial<SensorSnapshot> & {
    source: SensorSnapshot["source"];
    ts: string | null;
  },
): SensorSnapshot {
  return {
    temp: null,
    rh: null,
    vpd: null,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
    device_id: null,
    csvVendor: null,
    ...overrides,
  };
}

describe("buildSourceChip", () => {
  it("fresh manual → Manual / eligible tone / canPersist=true", () => {
    const c = buildSourceChip({
      status: "ok",
      snapshot: snap({ source: "manual", ts: FRESH_TS }),
      now: NOW,
    });
    expect(c.label).toBe("Manual");
    expect(c.tone).toBe("eligible");
    expect(c.canPersist).toBe(true);
    expect(c.qualifier).toBe("fresh");
  });
  it("fresh live → Live / eligible / canPersist=true", () => {
    const c = buildSourceChip({
      status: "ok",
      snapshot: snap({ source: "live", ts: FRESH_TS }),
      now: NOW,
    });
    expect(c.label).toBe("Live");
    expect(c.tone).toBe("eligible");
    expect(c.canPersist).toBe(true);
  });
  it("stale manual/live → warning tone, never eligible", () => {
    for (const source of ["manual", "live"] as const) {
      const c = buildSourceChip({
        status: "ok",
        snapshot: snap({ source, ts: staleTsFor(source) }),
        now: NOW,
      });
      expect(c.tone).toBe("warning");
      expect(c.canPersist).toBe(false);
      expect(c.qualifier).toBe("stale");
    }
  });
  // The other half of the source-aware boundary: an age that is stale for live
  // must remain current for manual, or the widened manual window is not real.
  it("a live-stale age is still current for manual", () => {
    const c = buildSourceChip({
      status: "ok",
      snapshot: snap({ source: "manual", ts: STALE_TS }),
      now: NOW,
    });
    expect(c.tone).toBe("eligible");
    expect(c.canPersist).toBe(true);
    expect(c.qualifier).toBe("fresh");
  });
  it("csv / diary / sim → context tone, never eligible", () => {
    for (const source of ["csv", "diary", "sim"] as const) {
      const c = buildSourceChip({
        status: "ok",
        snapshot: snap({ source, ts: FRESH_TS }),
        now: NOW,
      });
      expect(c.tone).toBe("context");
      expect(c.canPersist).toBe(false);
    }
  });
  it("unavailable / missing → caution, never eligible", () => {
    expect(buildSourceChip({ status: "ok", snapshot: null, now: NOW }).tone).toBe("caution");
    expect(
      buildSourceChip({
        status: "ok",
        snapshot: snap({ source: "unavailable", ts: null }),
        now: NOW,
      }).tone,
    ).toBe("caution");
    expect(buildSourceChip({ status: "unavailable", snapshot: null, now: NOW }).tone).toBe(
      "caution",
    );
  });
  it("never returns the eligible tone for non-fresh-manual/live", () => {
    const cases = [
      snap({ source: "csv", ts: FRESH_TS }),
      snap({ source: "diary", ts: FRESH_TS }),
      snap({ source: "sim", ts: FRESH_TS }),
      snap({ source: "manual", ts: MANUAL_STALE_TS }),
      snap({ source: "live", ts: STALE_TS }),
      snap({ source: "unavailable", ts: null }),
    ];
    for (const s of cases) {
      expect(buildSourceChip({ status: "ok", snapshot: s, now: NOW }).tone).not.toBe("eligible");
    }
  });
});

describe("SOURCE_ELIGIBILITY_HELP", () => {
  it("explains eligible sources include fresh manual and live", () => {
    expect(SOURCE_ELIGIBILITY_HELP.eligible.toLowerCase()).toMatch(/manual/);
    expect(SOURCE_ELIGIBILITY_HELP.eligible.toLowerCase()).toMatch(/live/);
  });
  it("explains context-only sources", () => {
    const text = SOURCE_ELIGIBILITY_HELP.contextOnly.toLowerCase();
    for (const s of [
      "csv",
      "demo",
      "diary",
      "simulated",
      "stale",
      "invalid",
      "unavailable",
      "unknown",
    ]) {
      expect(text).toContain(s);
    }
  });
  it("explains why stale/untrusted does not persist", () => {
    expect(SOURCE_ELIGIBILITY_HELP.why.toLowerCase()).toMatch(/stale|untrusted/);
  });
});

describe("emptyStateSnapshotCta", () => {
  it("stale manual → stale CTA prompting fresh snapshot", () => {
    const cta = emptyStateSnapshotCta({
      status: "ok",
      snapshot: snap({ source: "manual", ts: MANUAL_STALE_TS }),
      now: NOW,
    });
    expect(cta?.kind).toBe("stale");
    expect(cta?.showAddManualSnapshot).toBe(true);
    expect(cta?.message.toLowerCase()).toMatch(/fresh manual snapshot/);
  });
  it("stale live → stale CTA prompting fresh snapshot", () => {
    const cta = emptyStateSnapshotCta({
      status: "ok",
      snapshot: snap({ source: "live", ts: STALE_TS }),
      now: NOW,
    });
    expect(cta?.kind).toBe("stale");
    expect(cta?.showAddManualSnapshot).toBe(true);
  });
  it("context-only csv → context-only CTA", () => {
    const cta = emptyStateSnapshotCta({
      status: "ok",
      snapshot: snap({ source: "csv", ts: FRESH_TS }),
      now: NOW,
    });
    expect(cta?.kind).toBe("context-only");
    expect(cta?.message.toLowerCase()).toMatch(/context-only/);
  });
  it("fresh manual / live → no CTA", () => {
    expect(
      emptyStateSnapshotCta({
        status: "ok",
        snapshot: snap({ source: "manual", ts: FRESH_TS }),
        now: NOW,
      }),
    ).toBeNull();
    expect(
      emptyStateSnapshotCta({
        status: "ok",
        snapshot: snap({ source: "live", ts: FRESH_TS }),
        now: NOW,
      }),
    ).toBeNull();
  });
  it("missing snapshot → missing CTA", () => {
    const cta = emptyStateSnapshotCta({ status: "ok", snapshot: null, now: NOW });
    expect(cta?.kind).toBe("missing");
    expect(cta?.showAddManualSnapshot).toBe(true);
  });
  it("status not ok → null", () => {
    expect(emptyStateSnapshotCta({ status: "loading", snapshot: null, now: NOW })).toBeNull();
  });
});

describe("duplicateReassuranceCopy", () => {
  it("matching open alert + persistable → 'No duplicate was created'", () => {
    expect(
      duplicateReassuranceCopy({
        canPersist: true,
        hasOpenAlerts: true,
        hasMatchingOpenAlert: true,
      }),
    ).toMatch(/no duplicate/i);
  });
  it("open alert + persistable → alternative copy", () => {
    expect(duplicateReassuranceCopy({ canPersist: true, hasOpenAlerts: true })).toMatch(
      /will not create a duplicate/i,
    );
  });
  it("persistable but no open alerts → null (no safe inference)", () => {
    expect(duplicateReassuranceCopy({ canPersist: true, hasOpenAlerts: false })).toBeNull();
  });
  it("not persistable → null even with open alerts", () => {
    expect(duplicateReassuranceCopy({ canPersist: false, hasOpenAlerts: true })).toBeNull();
  });
});
