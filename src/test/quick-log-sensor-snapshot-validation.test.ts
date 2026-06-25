import { describe, it, expect } from "vitest";
import { validateQuickLogSensorSnapshot } from "@/lib/quick-log/quickLogSensorSnapshotValidation";

describe("validateQuickLogSensorSnapshot — absent telemetry", () => {
  it("treats null as absent (no snapshot, not an error)", () => {
    const r = validateQuickLogSensorSnapshot(null);
    expect(r).toEqual({ ok: true, snapshot: null });
  });
  it("treats undefined as absent", () => {
    const r = validateQuickLogSensorSnapshot(undefined);
    expect(r).toEqual({ ok: true, snapshot: null });
  });
  it("treats empty metrics object as absent, even with source/captured_at supplied", () => {
    const r = validateQuickLogSensorSnapshot({
      source: "csv",
      captured_at: "2026-06-09T12:00:00Z",
      metrics: {},
    });
    expect(r).toEqual({ ok: true, snapshot: null });
  });
});

describe("validateQuickLogSensorSnapshot — malformed shapes", () => {
  it("rejects non-object payload", () => {
    const r = validateQuickLogSensorSnapshot("nope" as unknown);
    expect(r.ok).toBe(false);
  });
  it("rejects array payload", () => {
    const r = validateQuickLogSensorSnapshot([1, 2, 3] as unknown);
    expect(r.ok).toBe(false);
  });
  it("rejects missing metrics field", () => {
    const r = validateQuickLogSensorSnapshot({
      source: "csv",
      captured_at: "2026-06-09T12:00:00Z",
    });
    expect(r.ok).toBe(false);
  });
  it("rejects non-object metrics payload", () => {
    const r = validateQuickLogSensorSnapshot({
      source: "csv",
      captured_at: "2026-06-09T12:00:00Z",
      metrics: "temperature_c=24",
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateQuickLogSensorSnapshot — provenance required with metrics", () => {
  const goodMetrics = { temperature_c: 24.3 };
  it("rejects missing source when metrics are present", () => {
    const r = validateQuickLogSensorSnapshot({
      captured_at: "2026-06-09T12:00:00Z",
      metrics: goodMetrics,
    });
    expect(r.ok).toBe(false);
  });
  it("rejects empty/whitespace source when metrics are present", () => {
    const r = validateQuickLogSensorSnapshot({
      source: "   ",
      captured_at: "2026-06-09T12:00:00Z",
      metrics: goodMetrics,
    });
    expect(r.ok).toBe(false);
  });
  it("rejects missing captured_at when metrics are present", () => {
    const r = validateQuickLogSensorSnapshot({
      source: "csv",
      metrics: goodMetrics,
    });
    expect(r.ok).toBe(false);
  });
  it("rejects invalid captured_at date when metrics are present", () => {
    const r = validateQuickLogSensorSnapshot({
      source: "csv",
      captured_at: "not-a-date",
      metrics: goodMetrics,
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateQuickLogSensorSnapshot — metric values", () => {
  const base = { source: "csv", captured_at: "2026-06-09T12:00:00Z" };
  it("accepts finite numeric metrics", () => {
    const r = validateQuickLogSensorSnapshot({
      ...base,
      metrics: { temperature_c: 24.3, humidity_pct: 55, vpd_kpa: 1.1 },
    });
    expect(r).toEqual({
      ok: true,
      snapshot: {
        source: "csv",
        captured_at: "2026-06-09T12:00:00Z",
        metrics: { temperature_c: 24.3, humidity_pct: 55, vpd_kpa: 1.1 },
      },
    });
  });
  it("rejects NaN metric values", () => {
    const r = validateQuickLogSensorSnapshot({
      ...base,
      metrics: { temperature_c: Number.NaN },
    });
    expect(r.ok).toBe(false);
  });
  it("rejects Infinity metric values", () => {
    const r = validateQuickLogSensorSnapshot({
      ...base,
      metrics: { temperature_c: Number.POSITIVE_INFINITY },
    });
    expect(r.ok).toBe(false);
  });
  it("rejects string metric values (no implicit coercion)", () => {
    const r = validateQuickLogSensorSnapshot({
      ...base,
      metrics: { temperature_c: "24.3" },
    });
    expect(r.ok).toBe(false);
  });
  it("rejects boolean metric values", () => {
    const r = validateQuickLogSensorSnapshot({
      ...base,
      metrics: { is_on: true },
    });
    expect(r.ok).toBe(false);
  });
  it("rejects null metric values", () => {
    const r = validateQuickLogSensorSnapshot({
      ...base,
      metrics: { temperature_c: null },
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateQuickLogSensorSnapshot — provenance preserved verbatim", () => {
  it("does not relabel source as 'live' or normalize captured_at", () => {
    const r = validateQuickLogSensorSnapshot({
      source: "csv",
      captured_at: "2026-06-09T12:00:00.000Z",
      metrics: { temperature_c: 24.3 },
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.snapshot) {
      expect(r.snapshot.source).toBe("csv");
      expect(r.snapshot.source).not.toBe("live");
      expect(r.snapshot.captured_at).toBe("2026-06-09T12:00:00.000Z");
    }
  });
  it("preserves manual / stale / demo sources without coercion", () => {
    for (const source of ["manual", "stale", "demo", "pi_bridge"]) {
      const r = validateQuickLogSensorSnapshot({
        source,
        captured_at: "2026-06-09T12:00:00Z",
        metrics: { temperature_c: 24.3 },
      });
      expect(r.ok).toBe(true);
      if (r.ok && r.snapshot) expect(r.snapshot.source).toBe(source);
    }
  });
});
