/**
 * EcoWitt Cloud Canary Preview UI tests.
 * Static-source assertions + pure library tests. No Supabase writes, no network.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  runEcowittCloudCanary,
  type EcowittCloudCanaryVerdict,
} from "@/lib/ecowittCloudCanaryVerdict";
import fixtures from "../../fixtures/ecowitt-cloud-canary-payloads.json";

const pageSrc = readFileSync(resolve(process.cwd(), "src/pages/OperatorEcowittCanary.tsx"), "utf8");

const BANNED_UI_WORDS = [
  "confirmed",
  "certain",
  "synced",
  "connected",
  "imported",
  "guaranteed",
];

const SECRET_LIKE_VALUES = [
  fixtures.payloads.happy_multi_channel.PASSKEY as string,
  "AA:BB:CC:DD:EE:01",
  fixtures.tents.TENT_A as string,
  fixtures.tents.TENT_B as string,
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

describe("CloudCanaryPreviewPanel — UI wiring", () => {
  it("renders a panel with fixture-only labeling", () => {
    expect(pageSrc).toContain('data-testid="cloud-canary-preview-panel"');
    expect(pageSrc).toContain('data-testid="cloud-canary-fixture-label"');
    expect(pageSrc).toMatch(/fixture-only/i);
  });

  it("displays summary metric cells with data-metric attributes", () => {
    for (const m of ["fixtures", "normalized", "unmapped", "invalid", "stale", "missing-metric", "ec-absence", "suspicious-flags"]) {
      expect(pageSrc).toContain(`data-metric="${m}"`);
    }
  });

  it("shows suspicious flag codes when present", () => {
    expect(pageSrc).toContain('data-testid="cloud-suspicious-codes"');
  });

  it("has a Copy Redacted Verdict JSON button wired to clipboard", () => {
    expect(pageSrc).toContain('data-testid="copy-cloud-verdict-json"');
    expect(pageSrc).toContain("Copy Redacted Verdict JSON");
    expect(pageSrc).toContain("navigator.clipboard.writeText");
  });

  it("imports runEcowittCloudCanary and cloudCanaryFixtures", () => {
    expect(pageSrc).toContain('from "@/lib/ecowittCloudCanaryVerdict"');
    expect(pageSrc).toContain('import cloudCanaryFixtures');
    expect(pageSrc).toContain("runEcowittCloudCanary");
  });

  it("places CloudCanaryPreviewPanel in the page JSX", () => {
    expect(pageSrc).toContain("<CloudCanaryPreviewPanel />");
  });

  it("does not introduce DB writes, function invokes, or device control", () => {
    const stripped = pageSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "")
      .toLowerCase();
    for (const w of ["functions.invoke", ".rpc(", "action_queue", "mqtt", "relay", "actuator"]) {
      expect(stripped).not.toContain(w);
    }
    expect(pageSrc).not.toMatch(/\.insert\(/);
    expect(pageSrc).not.toMatch(/\.update\(/);
    expect(pageSrc).not.toMatch(/\.delete\(/);
    expect(pageSrc).not.toMatch(/\.upsert\(/);
  });
});

describe("CloudCanaryPreviewPanel — redaction + safety", () => {
  const verdict: EcowittCloudCanaryVerdict = runEcowittCloudCanary(
    fixtureList,
    fixtures.mapping as unknown as Parameters<typeof runEcowittCloudCanary>[1],
    options,
  );

  const blob = JSON.stringify(verdict, null, 2);

  it("copy/export contains no secrets or raw identifiers", () => {
    for (const secret of SECRET_LIKE_VALUES) {
      expect(blob).not.toContain(secret);
    }
  });

  it("contains none of the banned UI-copy words", () => {
    const lower = blob.toLowerCase();
    for (const word of BANNED_UI_WORDS) {
      expect(lower).not.toContain(word);
    }
  });

  it("renders summary totals correctly in the pure verdict", () => {
    expect(verdict.summaries.length).toBe(8);
    expect(verdict.totals.mapped).toBeGreaterThan(0);
    expect(typeof verdict.totals.unmapped).toBe("number");
    expect(typeof verdict.totals.invalid).toBe("number");
    expect(typeof verdict.totals.stale).toBe("number");
  });

  it("fixture-only label text is visible in component source", () => {
    expect(pageSrc).toContain("Fixture-only:");
    expect(pageSrc).toContain("No real EcoWitt device is");
  });

  it("no raw MAC, PASSKEY, or tent_id appears in component source", () => {
    expect(pageSrc).not.toContain("AA:BB:CC:DD:EE:01");
    expect(pageSrc).not.toContain("FIXTURE-NOT-A-REAL-SECRET");
    expect(pageSrc).not.toContain("11111111-1111-1111-1111-111111111111");
    expect(pageSrc).not.toContain("22222222-2222-2222-2222-222222222222");
  });
});
