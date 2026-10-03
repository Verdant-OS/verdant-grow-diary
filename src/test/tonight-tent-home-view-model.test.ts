import { describe, it, expect } from "vitest";
import {
  buildTonightLastLog,
  buildTonightTentMetrics,
  resolveTonightTentSelection,
  TONIGHT_TENT_HOME_COPY,
  type TonightSensorRow,
} from "@/lib/tonightTentHomeViewModel";
import { LIVE_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function row(over: Partial<TonightSensorRow> & Pick<TonightSensorRow, "metric" | "value">) {
  return {
    id: `${over.metric}-${over.value}`,
    tent_id: "tent-a",
    source: "live",
    quality: "ok",
    ts: minutesAgo(2),
    captured_at: minutesAgo(2),
    raw_payload: null,
    ...over,
  } as TonightSensorRow;
}

const OK_ROWS = { status: "success" as const };
const NO_SNAPSHOT = { status: "idle" as const, snapshot: null };

describe("resolveTonightTentSelection", () => {
  const tentA = { id: "tent-a", name: "Veg", growId: "g1" };
  const tentB = { id: "tent-b", name: "Flower", growId: "g1" };

  it("returns none for an account with no tent and never invents one", () => {
    expect(resolveTonightTentSelection({ tents: [], plants: [], connectedTentId: null })).toEqual({
      kind: "none",
    });
  });

  it("selects the only tent", () => {
    expect(
      resolveTonightTentSelection({ tents: [tentA], plants: [], connectedTentId: null }),
    ).toEqual({ kind: "tent", basis: "only", tent: tentA });
  });

  it("selects the connected tent when it is the only tent with plants", () => {
    const sel = resolveTonightTentSelection({
      tents: [tentA, tentB],
      plants: [{ id: "p1", tentId: "tent-b", growId: "g1" }],
      connectedTentId: "tent-b",
    });
    expect(sel).toEqual({ kind: "tent", basis: "connected", tent: tentB });
  });

  it("asks the grower to choose when several tents have plants", () => {
    const sel = resolveTonightTentSelection({
      tents: [tentA, tentB],
      plants: [
        { id: "p1", tentId: "tent-a", growId: "g1" },
        { id: "p2", tentId: "tent-b", growId: "g1" },
      ],
      connectedTentId: "tent-a",
    });
    expect(sel.kind).toBe("choose");
  });

  it("asks the grower to choose when no tent has plants, sorted by name then id", () => {
    const sel = resolveTonightTentSelection({
      tents: [tentA, tentB],
      plants: [],
      connectedTentId: "tent-a",
    });
    expect(sel).toEqual({
      kind: "choose",
      tents: [
        { id: "tent-b", name: "Flower" },
        { id: "tent-a", name: "Veg" },
      ],
    });
  });

  it("ignores a connected tent id that is not in the loaded tents", () => {
    const sel = resolveTonightTentSelection({
      tents: [tentA, tentB],
      plants: [{ id: "p1", tentId: "tent-x", growId: "g1" }],
      connectedTentId: "tent-x",
    });
    expect(sel.kind).toBe("choose");
  });
});

describe("buildTonightTentMetrics — per-metric provenance", () => {
  it("keeps each metric's own source and capture time", () => {
    const metrics = buildTonightTentMetrics({
      rows: [
        row({ metric: "temperature_c", value: 24, source: "live", captured_at: minutesAgo(30) }),
        row({ metric: "humidity_pct", value: 55, source: "live", captured_at: minutesAgo(2) }),
      ],
      rowsRead: OK_ROWS,
      snapshot: NO_SNAPSHOT,
      now: NOW,
    });
    const temp = metrics.find((m) => m.key === "temp")!;
    const rh = metrics.find((m) => m.key === "rh")!;
    expect(rh).toMatchObject({ state: "value", value: 55, source: "live", ageText: "2m ago" });
    // A newer RH-only reading must not renew temperature.
    expect(temp.capturedAt).toBe(minutesAgo(30));
    expect(temp.ageText).toBe("30m ago");
  });

  it("picks the newest finite candidate per metric", () => {
    const [temp] = buildTonightTentMetrics({
      rows: [
        row({ metric: "temperature_c", value: 20, captured_at: minutesAgo(10) }),
        row({ metric: "temperature_c", value: 25, captured_at: minutesAgo(1) }),
        row({ metric: "temperature_c", value: Number.NaN, captured_at: minutesAgo(0) }),
      ],
      rowsRead: OK_ROWS,
      snapshot: NO_SNAPSHOT,
      now: NOW,
    });
    expect(temp.value).toBe(25);
  });

  it("reports Missing, not healthy, when a metric has no reading", () => {
    const metrics = buildTonightTentMetrics({
      rows: [],
      rowsRead: OK_ROWS,
      snapshot: NO_SNAPSHOT,
      now: NOW,
    });
    for (const m of metrics) {
      expect(m.state).toBe("missing");
      expect(m.value).toBeNull();
      expect(m.sourceLabel).toBeNull();
    }
    expect(metrics.map((m) => m.key)).toEqual(["temp", "rh", "vpd"]);
  });

  it("treats a blank or unknown source as invalid and shows no number", () => {
    const [temp] = buildTonightTentMetrics({
      // Bypass the evidence fence's source allow-list via the snapshot path.
      rows: [],
      rowsRead: OK_ROWS,
      snapshot: {
        status: "ok",
        snapshot: { source: "unverified", ts: minutesAgo(1), temp: 77, rh: null, vpd: null },
      },
      now: NOW,
    });
    expect(temp).toMatchObject({ state: "invalid", value: null, source: "invalid" });
    expect(temp.sourceLabel).toBe("Invalid reading");
  });

  it("drops rows the Dashboard evidence fence rejects (bad quality, unknown source)", () => {
    const [temp] = buildTonightTentMetrics({
      rows: [
        row({ metric: "temperature_c", value: 30, quality: "error" }),
        row({ metric: "temperature_c", value: 31, source: "" }),
      ],
      rowsRead: OK_ROWS,
      snapshot: NO_SNAPSHOT,
      now: NOW,
    });
    expect(temp.state).toBe("missing");
  });

  it("labels an old live reading as stale, never live", () => {
    const old = new Date(NOW.getTime() - LIVE_CURRENT_STATE_STALE_MS - 60_000).toISOString();
    const [temp] = buildTonightTentMetrics({
      rows: [row({ metric: "temperature_c", value: 24, captured_at: old, ts: old })],
      rowsRead: OK_ROWS,
      snapshot: NO_SNAPSHOT,
      now: NOW,
    });
    expect(temp.source).toBe("stale");
    expect(temp.sourceLabel).toBe("Stale data");
  });

  it("labels demo values visibly as demo", () => {
    const [temp] = buildTonightTentMetrics({
      rows: [],
      rowsRead: OK_ROWS,
      snapshot: {
        status: "ok",
        snapshot: { source: "sim", ts: minutesAgo(1), temp: 22, rh: null, vpd: null },
      },
      now: NOW,
    });
    expect(temp).toMatchObject({ state: "value", source: "demo", sourceLabel: "Demo data" });
  });

  it("carries diary-backed manual readings with their own time", () => {
    const metrics = buildTonightTentMetrics({
      rows: [row({ metric: "temperature_c", value: 24, captured_at: minutesAgo(5) })],
      rowsRead: OK_ROWS,
      snapshot: {
        status: "ok",
        snapshot: { source: "diary", ts: minutesAgo(90), temp: 20, rh: 60, vpd: null },
      },
      now: NOW,
    });
    const temp = metrics.find((m) => m.key === "temp")!;
    const rh = metrics.find((m) => m.key === "rh")!;
    expect(temp).toMatchObject({ value: 24, source: "live" });
    expect(rh).toMatchObject({ value: 60, source: "manual", ageText: "1h ago" });
  });

  it("treats a future capture time as invalid", () => {
    const [temp] = buildTonightTentMetrics({
      rows: [
        row({
          metric: "temperature_c",
          value: 24,
          captured_at: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
        }),
      ],
      rowsRead: OK_ROWS,
      snapshot: NO_SNAPSHOT,
      now: NOW,
    });
    expect(temp.state).toBe("invalid");
  });

  it("distinguishes loading and failed reads from an empty result", () => {
    const loading = buildTonightTentMetrics({
      rows: [],
      rowsRead: { status: "loading" },
      snapshot: NO_SNAPSHOT,
      now: NOW,
    });
    expect(loading.every((m) => m.state === "loading")).toBe(true);

    const failed = buildTonightTentMetrics({
      rows: [],
      rowsRead: { status: "error" },
      snapshot: { status: "unavailable", snapshot: null },
      now: NOW,
    });
    expect(failed.every((m) => m.state === "unavailable")).toBe(true);
  });

  it("still shows a value from one source when the other read failed", () => {
    const [temp, rh] = buildTonightTentMetrics({
      rows: [],
      rowsRead: { status: "error" },
      snapshot: {
        status: "ok",
        snapshot: { source: "manual", ts: minutesAgo(3), temp: 23, rh: null, vpd: null },
      },
      now: NOW,
    });
    expect(temp.state).toBe("value");
    // A failed read cannot prove absence.
    expect(rh.state).toBe("unavailable");
  });
});

describe("buildTonightLastLog", () => {
  it("shows the age of a log made today", () => {
    expect(
      buildTonightLastLog({ applies: true, status: "ok", latestAt: minutesAgo(120), now: NOW }),
    ).toEqual({ kind: "today", text: `${TONIGHT_TENT_HOME_COPY.lastLogPrefix} 2h ago` });
  });

  it("says No log today for an older log or no log at all", () => {
    const yesterday = new Date(NOW);
    yesterday.setDate(yesterday.getDate() - 1);
    for (const latestAt of [yesterday.toISOString(), null]) {
      expect(buildTonightLastLog({ applies: true, status: "ok", latestAt, now: NOW })).toEqual({
        kind: "none_today",
        text: TONIGHT_TENT_HOME_COPY.noLogToday,
      });
    }
  });

  it("does not claim No log today when the read failed, is loading, or does not apply", () => {
    expect(
      buildTonightLastLog({ applies: true, status: "unavailable", latestAt: null, now: NOW }).kind,
    ).toBe("unavailable");
    expect(
      buildTonightLastLog({ applies: true, status: "loading", latestAt: null, now: NOW }).kind,
    ).toBe("loading");
    expect(
      buildTonightLastLog({ applies: false, status: "ok", latestAt: null, now: NOW }).kind,
    ).toBe("unavailable");
  });
});
