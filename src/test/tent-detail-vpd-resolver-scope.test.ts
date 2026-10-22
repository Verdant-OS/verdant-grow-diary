/**
 * Codex review of #2303 at 4dc23aad: two Tent Detail VPD resolver cases.
 * - P2: a newer Quick Log manual VPD (grow_events, which Tonight does not
 *   read) must not be replaced by Tonight's older value.
 * - P2: a sensor-truth rejection at an older capture must not block Tonight's
 *   newer, valid capture; a rejection at Tonight's own capture still does.
 * Codex review at 69de43db:
 * - P1: a same-capture temperature or RH whose intake quality flag is not ok
 *   rejects Tonight's direct VPD, however plausible the flagged number.
 */
import { describe, expect, it } from "vitest";
import {
  resolveTentDetailVpd,
  tentDetailCaptureClimate,
  tentDetailVpdRowUntrusted,
  tonightCaptureRejected,
} from "@/lib/tentDetailVpdRules";
import { sensorCaptureRef } from "@/lib/sensorCaptureRefRules";
import { buildTonightTentMetrics, type TonightMetricView } from "@/lib/tonightTentHomeViewModel";

const NOW = Date.parse("2026-10-22T03:00:00.000Z");
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();

const tonightAt = (hoursAgo: number): TonightMetricView => ({
  key: "vpd",
  label: "VPD",
  state: "value",
  value: 1.75,
  source: "manual",
  sourceLabel: "Manual",
  capturedAt: at(hoursAgo),
  ageText: `${hoursAgo}h ago`,
  calculated: true,
});
const CONTRIBUTORS = { temp: (80 - 32) / 1.8, rh: 50 };
const NO_VPD = { value: null, capturedAt: null, source: null, stale: false };

describe("resolveTentDetailVpd keeps newer evidence", () => {
  it("keeps a newer Quick Log manual VPD over Tonight's older value", () => {
    const manual = { value: 1.1, capturedAt: at(0.5), source: "manual" as const, stale: false };
    const out = resolveTentDetailVpd({
      tonight: tonightAt(2),
      existing: manual,
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      contributors: CONTRIBUTORS,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.1);
    expect(out.capturedAt).toBe(manual.capturedAt);
    expect(out.calculated).toBe(false);
  });

  it("keeps a direct manual VPD over a calculated Tonight value at the same instant (Codex P2 at 85ec1e78)", () => {
    const manual = { value: 1.1, capturedAt: at(2), source: "manual" as const, stale: false };
    const out = resolveTentDetailVpd({
      tonight: tonightAt(2),
      existing: manual,
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      contributors: CONTRIBUTORS,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.1);
    expect(out.calculated).toBe(false);
  });

  it("lets a direct Tonight VPD stand at the same instant", () => {
    const manual = { value: 1.1, capturedAt: at(2), source: "manual" as const, stale: false };
    const out = resolveTentDetailVpd({
      tonight: { ...tonightAt(2), value: 1.75, calculated: false },
      existing: manual,
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      contributors: null,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.75);
  });

  it("still prefers Tonight when it is the newer capture", () => {
    const manual = { value: 1.1, capturedAt: at(5), source: "manual" as const, stale: false };
    const out = resolveTentDetailVpd({
      tonight: tonightAt(2),
      existing: manual,
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      contributors: CONTRIBUTORS,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.75);
    expect(out.calculated).toBe(true);
  });
});

describe("resolveTentDetailVpd scopes rejections to their capture", () => {
  it("does not let an older rejected capture block Tonight's newer valid one", () => {
    const out = resolveTentDetailVpd({
      tonight: tonightAt(1),
      existing: NO_VPD,
      rejectedMetrics: ["rh"],
      rejectedCapturedAt: at(48),
      contributors: CONTRIBUTORS,
      captureClimate: [{ at: at(1), temp: CONTRIBUTORS.temp, rh: CONTRIBUTORS.rh }],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.75);
  });

  it.each([0, 1])(
    "keeps blocking when the rejection is at or after Tonight's capture (%ih newer)",
    (offset) => {
      const out = resolveTentDetailVpd({
        tonight: tonightAt(1 + offset),
        existing: NO_VPD,
        rejectedMetrics: ["rh"],
        rejectedCapturedAt: at(1),
        contributors: CONTRIBUTORS,
        captureClimate: [],
        nowMs: NOW,
      });
      expect(out.value).toBeNull();
    },
  );

  it("keeps blocking when the rejected capture time is unknown", () => {
    const out = resolveTentDetailVpd({
      tonight: tonightAt(1),
      existing: NO_VPD,
      rejectedMetrics: ["vpd"],
      rejectedCapturedAt: null,
      contributors: CONTRIBUTORS,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBeNull();
  });
});

describe("resolveTentDetailVpd withholds a VPD from its rejected capture (Codex P1 at d6ef3a20)", () => {
  // The header's own direct VPD: plausible, at the capture whose RH it rejected.
  const headerVpd = { value: 1.2, capturedAt: at(0.1), source: "live", stale: false };

  it("returns no VPD when existing is the rejected capture's own reading and Tonight is missing", () => {
    const out = resolveTentDetailVpd({
      tonight: { ...tonightAt(0.1), state: "missing", value: null },
      existing: headerVpd,
      rejectedMetrics: ["rh"],
      rejectedCapturedAt: at(0.1),
      contributors: null,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBeNull();
  });

  it("does not let the newer-existing branch restore it over an older Tonight capture", () => {
    const out = resolveTentDetailVpd({
      tonight: tonightAt(2),
      existing: headerVpd,
      rejectedMetrics: ["rh"],
      rejectedCapturedAt: at(0.1),
      contributors: CONTRIBUTORS,
      captureClimate: [{ at: at(2), temp: CONTRIBUTORS.temp, rh: CONTRIBUTORS.rh }],
      nowMs: NOW,
    });
    expect(out.value).toBeNull();
  });

  it("does not restore it when Tonight's newer capture fails sensor truth either", () => {
    const out = resolveTentDetailVpd({
      tonight: { ...tonightAt(0.05), calculated: false },
      existing: headerVpd,
      rejectedMetrics: ["rh"],
      rejectedCapturedAt: at(0.1),
      contributors: null,
      captureClimate: [{ at: at(0.05), temp: 24, rh: 150 }],
      nowMs: NOW,
    });
    expect(out.value).toBeNull();
  });

  it("cannot prove independence from an unknown capture time", () => {
    const out = resolveTentDetailVpd({
      tonight: undefined,
      existing: { ...headerVpd, capturedAt: null },
      rejectedMetrics: ["temp"],
      rejectedCapturedAt: at(0.1),
      contributors: null,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBeNull();
  });

  it("keeps an observation from an independent earlier capture", () => {
    const out = resolveTentDetailVpd({
      tonight: undefined,
      existing: { value: 1.0, capturedAt: at(3), source: "manual", stale: false },
      rejectedMetrics: ["rh"],
      rejectedCapturedAt: at(0.1),
      contributors: null,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.0);
  });

  it("leaves existing alone when the header rejected only a non-climate metric", () => {
    const out = resolveTentDetailVpd({
      tonight: undefined,
      existing: headerVpd,
      rejectedMetrics: ["co2"],
      rejectedCapturedAt: at(0.1),
      contributors: null,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.2);
  });
});

describe("resolveTentDetailVpd honours intake quality at Tonight's capture", () => {
  // A stored vpd_kpa row Tonight selected directly, not calculated.
  const direct = (): TonightMetricView => ({ ...tonightAt(1), value: 1.2, calculated: false });
  const rowsAt = (hoursAgo: number, quality: string | null) => [
    { metric: "temperature_c", value: 24, captured_at: at(hoursAgo), quality },
    { metric: "humidity_pct", value: 55, captured_at: at(hoursAgo), quality: "ok" },
  ];

  it("carries each row's intake quality into the capture climate", () => {
    const climate = tentDetailCaptureClimate(rowsAt(1, "invalid"), null);
    expect(climate.map((c) => c.untrusted)).toEqual([true, false]);
    expect(tentDetailCaptureClimate(rowsAt(1, null), null).map((c) => c.untrusted)).toEqual([
      false,
      false,
    ]);
  });

  it.each(["invalid", "degraded"])(
    "rejects a direct VPD whose capture holds a plausible temperature flagged %s",
    (quality) => {
      const out = resolveTentDetailVpd({
        tonight: direct(),
        existing: NO_VPD,
        // The header's truth check rejected nothing: the flagged value is plausible,
        // and the header belongs to a newer CO2-only capture anyway.
        rejectedMetrics: [],
        rejectedCapturedAt: at(0.05),
        contributors: null,
        captureClimate: tentDetailCaptureClimate(rowsAt(1, quality), null),
        nowMs: NOW,
      });
      expect(out.value).toBeNull();
    },
  );

  it("keeps the direct VPD when the same capture's climate is flagged ok", () => {
    const out = resolveTentDetailVpd({
      tonight: direct(),
      existing: NO_VPD,
      rejectedMetrics: [],
      rejectedCapturedAt: at(0.05),
      contributors: null,
      captureClimate: tentDetailCaptureClimate(rowsAt(1, "ok"), null),
      nowMs: NOW,
    });
    expect(out.value).toBe(1.2);
  });

  it("withholds the same-capture direct VPD the header still carries (Codex P1 at 0c19a9e0)", () => {
    // In TentDetail, `existing` is the header's own direct VPD, graded without
    // the row quality flag: at Tonight's instant it is the rejected reading.
    const headerVpd = { value: 1.2, capturedAt: at(1), source: "manual" as const, stale: false };
    const out = resolveTentDetailVpd({
      tonight: direct(),
      existing: headerVpd,
      rejectedMetrics: [],
      rejectedCapturedAt: at(0.05),
      contributors: null,
      captureClimate: tentDetailCaptureClimate(rowsAt(1, "degraded"), null),
      nowMs: NOW,
    });
    expect(out.value).toBeNull();
    expect(out.capturedAt).toBeNull();
  });

  it("keeps an independent older observation when Tonight's capture is flagged", () => {
    const older = { value: 1.0, capturedAt: at(3), source: "manual" as const, stale: false };
    const out = resolveTentDetailVpd({
      tonight: direct(),
      existing: older,
      rejectedMetrics: [],
      rejectedCapturedAt: at(0.05),
      contributors: null,
      captureClimate: tentDetailCaptureClimate(rowsAt(1, "invalid"), null),
      nowMs: NOW,
    });
    expect(out.value).toBe(1.0);
    expect(out.capturedAt).toBe(older.capturedAt);
  });

  it("ignores a flagged row at a different capture", () => {
    const out = resolveTentDetailVpd({
      tonight: direct(),
      existing: NO_VPD,
      rejectedMetrics: [],
      rejectedCapturedAt: at(0.05),
      contributors: null,
      captureClimate: tentDetailCaptureClimate(rowsAt(6, "invalid"), null),
      nowMs: NOW,
    });
    expect(out.value).toBe(1.2);
  });
});

describe("tentDetailVpdRowUntrusted (Codex P1 at 307b10f4)", () => {
  const vpdRow = (hoursAgo: number, quality: string | null) => ({
    metric: "vpd_kpa",
    value: 1.2,
    captured_at: at(hoursAgo),
    quality,
  });

  it.each(["invalid", "degraded", "suspect"])(
    "flags a vpd_kpa row marked %s at the capture",
    (q) => {
      expect(tentDetailVpdRowUntrusted([vpdRow(1, q)], at(1))).toBe(true);
    },
  );

  it.each([null, "", "ok", "OK "])("trusts a vpd_kpa row with quality %j", (q) => {
    expect(tentDetailVpdRowUntrusted([vpdRow(1, q)], at(1))).toBe(false);
  });

  it("ignores a flagged row at another capture, a non-VPD row and an unknown capture time", () => {
    expect(tentDetailVpdRowUntrusted([vpdRow(5, "invalid")], at(1))).toBe(false);
    expect(
      tentDetailVpdRowUntrusted(
        [{ metric: "temperature_c", value: 24, captured_at: at(1), quality: "invalid" }],
        at(1),
      ),
    ).toBe(false);
    expect(tentDetailVpdRowUntrusted([vpdRow(1, "invalid")], null)).toBe(false);
    expect(tentDetailVpdRowUntrusted(null, at(1))).toBe(false);
  });
});

describe("the capture gate joins climate by record identity (Codex P1 on #2303 at fa8edcff)", () => {
  const T = at(1);
  const LIVE_ROWS = [
    { metric: "vpd_kpa", value: 1.2, captured_at: T, source: "live" },
    { metric: "temperature_c", value: 24, captured_at: T, source: "live" },
    { metric: "humidity_pct", value: 55, captured_at: T, source: "live" },
  ];
  const diary = (id?: string) => ({
    source: "diary",
    ts: T,
    temp: 24,
    rh: 150,
    vpd: null as number | null,
    ...(id ? { diary_evidence_ref: { id, entry_at: T } } : {}),
  });
  // Tonight's real VPD view, with the capture refs it assigns.
  const tonightVpd = (
    rows: ReadonlyArray<{ metric: string; value: number; captured_at: string; source?: string }>,
    snapshot: ReturnType<typeof diary> | null,
  ) =>
    buildTonightTentMetrics({
      rows: rows.map((r) => ({ ...r, tent_id: "tent-1", ts: r.captured_at })),
      rowsRead: { status: "success" },
      snapshot: { status: snapshot ? "ok" : "idle", snapshot },
      now: new Date(NOW),
    }).find((m) => m.key === "vpd")!;

  it("keeps a live sensor VPD beside a separate diary entry with impossible RH at the same instant", () => {
    const snap = diary("diary-entry-1");
    const vpd = tonightVpd(LIVE_ROWS, snap);
    expect(vpd.value).toBe(1.2);
    expect(vpd.captureRefs).toEqual([sensorCaptureRef(T, "live")]);
    const climate = tentDetailCaptureClimate(LIVE_ROWS, snap);
    expect(tonightCaptureRejected(vpd, null, climate)).toBe(false);
    const out = resolveTentDetailVpd({
      tonight: vpd,
      existing: NO_VPD,
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      contributors: null,
      captureClimate: climate,
      nowMs: NOW,
    });
    expect(out.value).toBe(1.2);
  });

  it("rejects when the impossible RH is in the VPD's own record", () => {
    // The diary entry itself carries the VPD and the impossible RH.
    const snap = { ...diary("diary-entry-2"), vpd: 1.1 };
    const vpd = tonightVpd([], snap);
    expect(vpd.captureRefs).toEqual(["diary:diary-entry-2"]);
    expect(tonightCaptureRejected(vpd, null, tentDetailCaptureClimate([], snap))).toBe(true);
    // A sensor RH row from the VPD's own ingest (same instant, live family).
    const rows = [
      LIVE_ROWS[0],
      { metric: "humidity_pct", value: 150, captured_at: T, source: "live" },
    ];
    const live = tonightVpd(rows, null);
    expect(tonightCaptureRejected(live, null, tentDetailCaptureClimate(rows, null))).toBe(true);
  });

  it("rejects conservatively when either identity is unknown", () => {
    // A diary snapshot without its entry id is an unknown record at the same instant.
    const vpd = tonightVpd(LIVE_ROWS, diary());
    expect(tonightCaptureRejected(vpd, null, tentDetailCaptureClimate(LIVE_ROWS, diary()))).toBe(
      true,
    );
    // A row with no source has no identity.
    const sourceless = [{ metric: "humidity_pct", value: 150, captured_at: T }];
    expect(tonightCaptureRejected(vpd, null, tentDetailCaptureClimate(sourceless, null))).toBe(
      true,
    );
    // A Tonight view without refs falls back to the instant.
    const noRefs: TonightMetricView = { ...vpd, captureRefs: undefined };
    expect(
      tonightCaptureRejected(noRefs, null, tentDetailCaptureClimate(LIVE_ROWS, diary("d-3"))),
    ).toBe(true);
  });
});
