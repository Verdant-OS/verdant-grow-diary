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
import {
  snapshotFromReadings,
  SOURCE_LABEL,
  type SensorReadingLike,
} from "@/lib/sensorSnapshot";

const TS = "2026-07-15T12:00:00.000Z";

function row(source: string | null, metric = "temp_c", value = 24): SensorReadingLike {
  return { ts: TS, metric, value, source };
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

  it("'pi_bridge' stays in the live reservation (pinned first-party path)", () => {
    // Deliberate prior decision, pinned by manual-sensor-snapshot-v1-audit:
    // the Pi bridge is the first-party live-ingest path and its rows carry
    // the live label. The reservation is exactly {live, pi_bridge}.
    const snap = snapshotFromReadings([row("pi_bridge")]);
    expect(snap?.source).toBe("live");
  });

  it("canonical 'stale' and 'invalid' sources → unverified", () => {
    expect(snapshotFromReadings([row("stale")])?.source).toBe("unverified");
    expect(snapshotFromReadings([row("invalid")])?.source).toBe("unverified");
  });

  it("null/missing source → unverified", () => {
    expect(snapshotFromReadings([row(null)])?.source).toBe("unverified");
    expect(
      snapshotFromReadings([{ ts: TS, metric: "temp_c", value: 24 }])?.source,
    ).toBe("unverified");
  });

  it("mixed live + vendor rows at the same timestamp → unverified", () => {
    const snap = snapshotFromReadings([
      row("live"),
      row("ecowitt", "rh_pct", 55),
    ]);
    expect(snap?.source).toBe("unverified");
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
});

describe("static contract — the classification has no live fallthrough", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../lib/sensorSnapshot.ts"),
    "utf8",
  );

  it("gates 'live' behind an every(live-reservation) check", () => {
    expect(SRC).toMatch(/allLive\s*=/);
    expect(SRC).toMatch(
      /every\(\(r\) => r\.source === "live" \|\| r\.source === "pi_bridge"\)/,
    );
  });

  it("terminal classification branch is 'unverified', not 'live'", () => {
    expect(SRC).toMatch(/allLive\s*\?\s*"live"\s*:\s*"unverified"/);
  });
});
