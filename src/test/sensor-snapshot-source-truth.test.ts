/**
 * snapshotFromReadings — source-classification truth tests.
 *
 * The Dashboard "Latest Environment" card previously classified ANY row
 * whose source was not manual/sim/csv as "live" — including raw vendor
 * strings ("ecowitt", "pi_bridge"), canonical "demo"/"stale"/"invalid",
 * and arbitrary junk. "Live sensor" is a claim, not a default: it now
 * requires every row at the latest timestamp to literally carry
 * source === "live"; everything unrecognized classifies as "unverified".
 *
 * Pure unit tests — no DB, no rendering.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { snapshotFromReadings, SOURCE_LABEL, type SensorReadingLike } from "@/lib/sensorSnapshot";

const TS = "2026-07-15T12:00:00.000Z";

function row(
  source: string | null,
  metric = "temp_c",
  value = 24,
  quality: string | null = "ok",
): SensorReadingLike {
  return { ts: TS, metric, value, source, quality };
}

function liveRowWithRawPayload(raw_payload: unknown): SensorReadingLike {
  return { ...row("live"), raw_payload };
}

describe("live is a claim, not a default", () => {
  it("all rows literally 'live' → live", () => {
    const snap = snapshotFromReadings([row("live"), row("live", "rh_pct", 55)]);
    expect(snap?.source).toBe("live");
  });

  it("raw vendor source 'ecowitt' → unverified, never live", () => {
    const snap = snapshotFromReadings([row("ecowitt")]);
    expect(snap?.source).toBe("unverified");
  });

  it("legacy alias 'pi_bridge' stays unverified", () => {
    const snap = snapshotFromReadings([row("pi_bridge")]);
    expect(snap?.source).toBe("unverified");
  });

  it("source=live without exact quality=ok stays unverified", () => {
    expect(snapshotFromReadings([row("live", "temp_c", 24, null)])?.source).toBe("unverified");
    expect(snapshotFromReadings([row("live", "temp_c", 24, "degraded")])?.source).toBe(
      "unverified",
    );
  });

  it("canonical 'stale' and 'invalid' sources → unverified", () => {
    expect(snapshotFromReadings([row("stale")])?.source).toBe("unverified");
    expect(snapshotFromReadings([row("invalid")])?.source).toBe("unverified");
  });

  it("null/missing source → unverified", () => {
    expect(snapshotFromReadings([row(null)])?.source).toBe("unverified");
    expect(snapshotFromReadings([{ ts: TS, metric: "temp_c", value: 24 }])?.source).toBe(
      "unverified",
    );
  });

  it("mixed live + vendor rows at the same timestamp → unverified", () => {
    const snap = snapshotFromReadings([row("live"), row("ecowitt", "rh_pct", 55)]);
    expect(snap?.source).toBe("unverified");
  });

  it.each(["test", "demo"])(
    "source=live with explicit confidence=%s → unverified, never live",
    (confidence) => {
      const snap = snapshotFromReadings([liveRowWithRawPayload({ metadata: { confidence } })]);
      expect(snap?.source).toBe("unverified");
    },
  );

  it("source=live with a diagnostic Windows-listener lineage → unverified", () => {
    const snap = snapshotFromReadings([
      liveRowWithRawPayload({
        vendor: "ecowitt_windows_testbench",
        metadata: { reported_verdant_source: "demo" },
      }),
    ]);
    expect(snap?.source).toBe("unverified");
  });

  it("source=live with only the canonical verdant_source mirror → unverified", () => {
    const snap = snapshotFromReadings([
      liveRowWithRawPayload({
        vendor: "ecowitt_windows_testbench",
        metadata: { verdant_source: "live" },
      }),
    ]);
    expect(snap?.source).toBe("unverified");
  });

  it("source=live with explicit physical Windows-listener lineage stays live", () => {
    const snap = snapshotFromReadings([
      liveRowWithRawPayload({
        vendor: "ecowitt_windows_testbench",
        metadata: {
          confidence: "high",
          reported_verdant_source: "live",
          raw_payload: {
            stationtype: "GW2000A_V3.2.4",
            model: "GW2000A",
            dateutc: "2026-07-15 12:00:00",
          },
        },
      }),
    ]);
    expect(snap?.source).toBe("live");
  });
});

describe("demo telemetry can never read as live", () => {
  it("all-demo rows classify as sim (Simulated), not live", () => {
    const snap = snapshotFromReadings([row("demo"), row("demo", "rh_pct", 50)]);
    expect(snap?.source).toBe("sim");
    expect(SOURCE_LABEL[snap!.source]).toBe("Simulated");
  });

  it("mixed demo + sim rows classify as sim", () => {
    const snap = snapshotFromReadings([row("demo"), row("sim", "rh_pct", 50)]);
    expect(snap?.source).toBe("sim");
  });
});

describe("existing precedence preserved", () => {
  it("any manual row wins", () => {
    const snap = snapshotFromReadings([row("manual"), row("ecowitt", "rh_pct", 55)]);
    expect(snap?.source).toBe("manual");
  });

  it("csv precedence over unknown mixes (never promoted to live)", () => {
    const snap = snapshotFromReadings([row("csv"), row("ecowitt", "rh_pct", 55)]);
    expect(snap?.source).toBe("csv");
  });

  it("all-sim rows still classify as sim", () => {
    expect(snapshotFromReadings([row("sim")])?.source).toBe("sim");
  });
});

describe("unverified label honesty", () => {
  it("labels unverified sources as 'Unverified source' — no live wording", () => {
    expect(SOURCE_LABEL.unverified).toBe("Unverified source");
    expect(SOURCE_LABEL.unverified.toLowerCase()).not.toContain("live");
  });

  it("the provenance-only live bucket is neutral, not a current-Live claim", () => {
    expect(SOURCE_LABEL.live).toBe("Connected sensor");
  });
});

describe("static contract — the classification has no live fallthrough", () => {
  const SRC = readFileSync(resolve(__dirname, "../lib/sensorSnapshot.ts"), "utf8");

  it("gates 'live' behind exact canonical source and accepted quality", () => {
    expect(SRC).toMatch(/allLive\s*=/);
    expect(SRC).toContain('r.source === "live" && r.quality === "ok"');
    expect(SRC).not.toContain('r.source === "pi_bridge"');
    expect(SRC).toContain("!isSensorTestbenchRow(r)");
  });

  it("terminal classification branch is 'unverified', not 'live'", () => {
    expect(SRC).toMatch(/allLive\s*\?\s*"live"\s*:\s*"unverified"/);
  });
});
