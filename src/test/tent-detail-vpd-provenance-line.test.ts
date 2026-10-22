/**
 * Tent Detail VPD provenance and truth helpers introduced for #2303 / #2268.
 */
import { describe, expect, it } from "vitest";
import {
  tentDetailCaptureClimate,
  tentDetailVpdNeedsOwnProvenance,
  tonightVpdPassesTruth,
} from "@/lib/tentDetailVpdRules";
import type { TonightMetricView } from "@/lib/tonightTentHomeViewModel";

const NOW = Date.parse("2026-10-22T03:00:00.000Z");
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();

describe("tentDetailVpdNeedsOwnProvenance (Copilot P2 on #2303)", () => {
  const header = {
    vpd: 1.2,
    source: "live",
    capturedAt: at(1),
    stale: false,
  };
  const observation = {
    value: 1.2 as number | null,
    capturedAt: at(1),
    source: "live" as string | null,
    stale: false,
    calculated: false,
  };

  it("needs no line when the observation is empty", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: { ...observation, value: null },
        header,
      }),
    ).toBe(false);
  });

  it("needs its own line when anything differs from the header snapshot", () => {
    expect(tentDetailVpdNeedsOwnProvenance({ observation, header: { ...header, vpd: null } })).toBe(
      true,
    );
    expect(tentDetailVpdNeedsOwnProvenance({ observation, header: { ...header, vpd: 1.3 } })).toBe(
      true,
    );
    expect(
      tentDetailVpdNeedsOwnProvenance({ observation, header: { ...header, source: "manual" } }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation,
        header: { ...header, capturedAt: at(2) },
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({ observation, header: { ...header, stale: true } }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: { ...observation, calculated: true },
        header,
      }),
    ).toBe(true);
  });

  it("matches the header when value, source, time and staleness agree", () => {
    expect(tentDetailVpdNeedsOwnProvenance({ observation, header })).toBe(false);
  });
});

describe("tonightVpdPassesTruth", () => {
  const vpd = (): TonightMetricView => ({
    key: "vpd",
    label: "VPD",
    state: "value",
    value: 1.2,
    source: "live",
    sourceLabel: "Live",
    capturedAt: at(1),
    ageText: "1h ago",
    calculated: false,
  });

  it("rejects an out-of-range VPD before capture checks run", () => {
    expect(tonightVpdPassesTruth({ ...vpd(), value: 99 }, { temp: 24, rh: 55 }, [])).toBe(false);
  });

  it("delegates to the capture rejection gate for realistic values", () => {
    const climate = tentDetailCaptureClimate(
      [{ metric: "humidity_pct", value: 55, ts: at(1), quality: "invalid" }],
      null,
    );
    expect(tonightVpdPassesTruth(vpd(), null, climate)).toBe(false);
    expect(tonightVpdPassesTruth(vpd(), null, [])).toBe(true);
  });
});
