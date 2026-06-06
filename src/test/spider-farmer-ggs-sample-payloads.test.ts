import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeSpiderFarmerGgsPayload } from "@/lib/spiderFarmerGgsMappingRules";

interface SampleExpect {
  source: "live" | "stale" | "invalid";
  transport?: string;
  readingsInclude?: string[];
  readingsExclude?: string[];
  warningsInclude?: string[];
  warningsExclude?: string[];
  capturedAtNull?: boolean;
}

interface Sample {
  id: string;
  description: string;
  expect: SampleExpect;
  payload: Record<string, unknown>;
}

interface Fixture {
  now: string;
  samples: Sample[];
}

const fixturePath = resolve(
  process.cwd(),
  "docs/integrations/fixtures/spider-farmer-ggs-sample-payloads.json",
);
const fixtureText = readFileSync(fixturePath, "utf8");
const fixture = JSON.parse(fixtureText) as Fixture;
const NOW = new Date(fixture.now);

const REQUIRED_CONTRACT_FIELDS = [
  "provider",
  "transport",
  "captured_at",
  "tent_id",
  "controller_id",
  "confidence",
  "raw_payload",
] as const;

describe("Spider Farmer GGS sample payload fixtures", () => {
  it("loads at least 5 samples", () => {
    expect(fixture.samples.length).toBeGreaterThanOrEqual(5);
  });

  it("includes one of each required scenario", () => {
    const ids = fixture.samples.map((s) => s.id);
    for (const required of [
      "live_clean_mqtt",
      "stale_old_reading",
      "invalid_timestamp",
      "unit_mismatch",
      "numeric_strings_mqtt",
    ]) {
      expect(ids).toContain(required);
    }
  });

  for (const sample of fixture.samples) {
    describe(`sample: ${sample.id}`, () => {
      it("includes every adapter-contract field", () => {
        for (const f of REQUIRED_CONTRACT_FIELDS) {
          expect(
            sample.payload,
            `${sample.id} missing contract field ${f}`,
          ).toHaveProperty(f);
        }
        expect(sample.payload.provider).toBe("spider_farmer_ggs");
      });

      it("normalizes to the expected source classification", () => {
        const r = normalizeSpiderFarmerGgsPayload(sample.payload, { now: NOW });
        expect(r.source).toBe(sample.expect.source);
        if (sample.expect.transport) {
          expect(r.transport).toBe(sample.expect.transport);
        }
        if (sample.expect.capturedAtNull) {
          expect(r.captured_at).toBeNull();
        }
      });

      it("includes / excludes the expected readings", () => {
        const r = normalizeSpiderFarmerGgsPayload(sample.payload, { now: NOW });
        for (const k of sample.expect.readingsInclude ?? []) {
          expect(
            (r.readings as Record<string, unknown>)[k],
            `${sample.id} expected reading ${k}`,
          ).toBeDefined();
        }
        for (const k of sample.expect.readingsExclude ?? []) {
          expect(
            (r.readings as Record<string, unknown>)[k],
            `${sample.id} unexpected reading ${k}`,
          ).toBeUndefined();
        }
      });

      it("includes / excludes the expected warnings", () => {
        const r = normalizeSpiderFarmerGgsPayload(sample.payload, { now: NOW });
        for (const w of sample.expect.warningsInclude ?? []) {
          expect(r.warnings, `${sample.id} expected warning ${w}`).toContain(w);
        }
        for (const w of sample.expect.warningsExclude ?? []) {
          expect(r.warnings, `${sample.id} unexpected warning ${w}`).not.toContain(w);
        }
      });

      it("preserves raw_payload verbatim", () => {
        const r = normalizeSpiderFarmerGgsPayload(sample.payload, { now: NOW });
        expect(r.raw_payload).toBe(sample.payload);
      });

      it("propagates controller_id and tent_id from the sample", () => {
        const r = normalizeSpiderFarmerGgsPayload(sample.payload, { now: NOW });
        expect(r.controller_id).toBe(sample.payload.controller_id);
        expect(r.tent_id).toBe(sample.payload.tent_id);
      });
    });
  }
});

describe("Spider Farmer GGS fixture — static safety scan", () => {
  const upper = fixtureText;
  const lower = fixtureText.toLowerCase();

  it("contains no real-looking BLE MAC addresses", () => {
    const macs = upper.match(/\b[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}\b/g) ?? [];
    for (const mac of macs) {
      expect(
        mac.toUpperCase().startsWith("AA:BB:CC:"),
        `unexpected MAC-shaped literal: ${mac}`,
      ).toBe(true);
    }
  });

  it("contains no service_role / bearer / bridge-token / secret literals", () => {
    for (const term of [
      "service_role",
      "bearer ",
      "vbt_",
      "sk_live_",
      "sk_test_",
      "supabase_anon_key",
      "supabase_service_role",
      "api_key",
      "apikey",
      "authorization:",
    ]) {
      expect(lower, `fixture should not contain "${term}"`).not.toContain(term);
    }
  });

  it("contains no write/control language", () => {
    for (const term of [
      "command",
      "setpoint",
      "set_light",
      "set_fan",
      "write_",
      "actuate",
      "publish_command",
    ]) {
      expect(lower, `fixture should not contain "${term}"`).not.toContain(term);
    }
    // 'control' word-boundary check (allow 'controller_id')
    expect(lower).not.toMatch(/\bcontrol\b/);
  });

  it("README labels samples as synthetic, not real exports", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "docs/integrations/fixtures/README.md"),
      "utf8",
    ).toLowerCase();
    expect(readme).toContain("synthetic");
    expect(readme).toContain("not");
    expect(readme).toContain("real");
  });
});
