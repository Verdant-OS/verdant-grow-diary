import { describe, it, expect } from "vitest";
import { runEcowittCloudCanary } from "@/lib/ecowittCloudCanaryVerdict";
import fixtures from "../../fixtures/ecowitt-cloud-canary-payloads.json";

const BANNED_UI_WORDS = [
  "confirmed",
  "certain",
  "synced",
  "connected",
  "imported",
  "guaranteed",
];

const SECRET_LIKE_VALUES = [
  fixtures.payloads.happy_multi_channel.PASSKEY, // fixture-only marker
  "AA:BB:CC:DD:EE:01", // MAC must not appear in the redacted verdict
  fixtures.tents.TENT_A,
  fixtures.tents.TENT_B,
];

const ORDER = [
  "happy_multi_channel",
  "stale_only",
  "invalid_humidity",
  "stuck_soil_extreme",
  "unmapped_channel",
  "missing_metrics",
  "pressure_present",
  "celsius_looking_fahrenheit",
] as const;

const fixtureList = ORDER.map((id) => ({
  id,
  payload: (fixtures.payloads as Record<string, unknown>)[id],
}));

const options = { now: new Date(fixtures.now) };

describe("runEcowittCloudCanary (read-only fixture preview)", () => {
  const verdict = runEcowittCloudCanary(
    fixtureList,
    fixtures.mapping as unknown as Parameters<typeof runEcowittCloudCanary>[1],
    options,
  );

  it("produces one summary per fixture in order", () => {
    expect(verdict.summaries.map((s) => s.fixture_id)).toEqual(ORDER);
  });

  it("normalizes the happy multi-channel fixture as fully live and mapped", () => {
    const s = verdict.summaries.find((x) => x.fixture_id === "happy_multi_channel")!;
    expect(s.mapped_count).toBe(5);
    expect(s.live_count).toBe(5);
    expect(s.invalid_count).toBe(0);
    expect(s.stale_count).toBe(0);
    expect(s.unmapped_count).toBe(0);
  });

  it("marks the stale fixture as stale, never live", () => {
    const s = verdict.summaries.find((x) => x.fixture_id === "stale_only")!;
    expect(s.stale_count).toBe(2);
    expect(s.live_count).toBe(0);
  });

  it("counts invalid readings for out-of-range humidity", () => {
    const s = verdict.summaries.find((x) => x.fixture_id === "invalid_humidity")!;
    expect(s.invalid_count).toBeGreaterThanOrEqual(1);
    expect(s.live_count).toBe(0);
  });

  it("preserves unmapped channels instead of dropping them", () => {
    const s = verdict.summaries.find((x) => x.fixture_id === "unmapped_channel")!;
    expect(s.mapped_count).toBe(0);
    expect(s.unmapped_count).toBeGreaterThanOrEqual(2);
    expect(s.missing_metric).toBe(false);
  });

  it("flags the missing-metrics fixture", () => {
    const s = verdict.summaries.find((x) => x.fixture_id === "missing_metrics")!;
    expect(s.missing_metric).toBe(true);
    expect(verdict.any_missing_metric).toBe(true);
  });

  it("surfaces pressure as unmapped and never as a row", () => {
    const s = verdict.summaries.find((x) => x.fixture_id === "pressure_present")!;
    expect(s.pressure_unmapped).toBe(true);
  });

  it("aggregates suspicious flag codes including celsius-looking-fahrenheit", () => {
    expect(verdict.suspicious_flag_codes).toContain("celsius_looking_fahrenheit");
  });

  it("never invents an EC metric for EcoWitt", () => {
    expect(verdict.any_ec_metric_invented).toBe(false);
    for (const s of verdict.summaries) expect(s.ec_metric_invented).toBe(false);
  });

  it("redacts the verdict — no MAC, PASSKEY, or tent id strings appear", () => {
    const blob = JSON.stringify(verdict);
    for (const secret of SECRET_LIKE_VALUES) {
      expect(blob).not.toContain(secret);
    }
  });

  it("verdict text contains none of the banned UI-copy words", () => {
    const blob = JSON.stringify(verdict).toLowerCase();
    for (const word of BANNED_UI_WORDS) {
      expect(blob).not.toContain(word);
    }
  });

  it("totals match the per-fixture summaries", () => {
    const sum = (k: keyof (typeof verdict.summaries)[number]) =>
      verdict.summaries.reduce((a, s) => a + (s[k] as number), 0);
    expect(verdict.totals.mapped).toBe(sum("mapped_count"));
    expect(verdict.totals.unmapped).toBe(sum("unmapped_count"));
    expect(verdict.totals.invalid).toBe(sum("invalid_count"));
    expect(verdict.totals.stale).toBe(sum("stale_count"));
    expect(verdict.totals.live).toBe(sum("live_count"));
  });
});
