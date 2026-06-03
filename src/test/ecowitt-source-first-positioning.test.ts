/**
 * Ecowitt-first sensor source positioning — regression coverage.
 *
 * Locks Verdant's positioning: Ecowitt is the primary supported hardware
 * source. The adapter preserves captured_at, tags vendor honestly, never
 * upgrades unknown payloads to "live", and never silently uses gateway
 * indoor as canopy.
 *
 * This is additive coverage on top of `ecowitt-payload-adapter.test.ts`
 * and the sensor truth contract.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adaptEcoWittPayloadToBridgeInput } from "@/lib/ecowittPayloadAdapter";

const NOW = new Date("2026-06-03T12:00:00.000Z");
const TENT = "11111111-2222-3333-4444-555555555555";

const ecowittTs = (minutesAgo: number) =>
  new Date(NOW.getTime() - minutesAgo * 60_000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, "");

describe("Ecowitt source — vendor tagging", () => {
  it("metadata.vendor is always 'ecowitt' for Ecowitt payloads", () => {
    const r = adaptEcoWittPayloadToBridgeInput(
      { dateutc: ecowittTs(1), temp1f: 70, humidity1: 50 },
      { tentId: TENT },
    );
    expect(r.metadata.vendor).toBe("ecowitt");
    expect(r.metadata.device_family).toBe("ecowitt_custom_upload");
  });

  it("non-object payloads still tag vendor 'ecowitt' (never silently rebadged)", () => {
    const r = adaptEcoWittPayloadToBridgeInput(null, { tentId: TENT });
    expect(r.ok).toBe(false);
    expect(r.metadata.vendor).toBe("ecowitt");
  });
});

describe("Ecowitt source — captured_at + raw payload truth", () => {
  it("preserves captured_at when payload supplies dateutc", () => {
    const r = adaptEcoWittPayloadToBridgeInput(
      { dateutc: ecowittTs(3), temp1f: 72, humidity1: 55 },
      { tentId: TENT },
    );
    expect(r.input.captured_at).not.toBeNull();
    expect(Number.isFinite(new Date(r.input.captured_at!).getTime())).toBe(true);
  });

  it("never invents captured_at from server time without explicit opt-in", () => {
    const r = adaptEcoWittPayloadToBridgeInput(
      { temp1f: 72 },
      { tentId: TENT },
    );
    expect(r.input.captured_at).toBeNull();
    expect(r.metadata.server_received_at_used).toBe(false);
    expect(r.warnings).toContain("captured_at_missing");
  });
});

describe("Ecowitt source — never upgraded to fake 'live'", () => {
  it("submitted_source defaults to 'unknown' (not 'live')", () => {
    const r = adaptEcoWittPayloadToBridgeInput(
      { dateutc: ecowittTs(2), temp1f: 70 },
      { tentId: TENT },
    );
    expect(r.input.submitted_source).not.toBe("live");
  });
});

describe("Ecowitt source — adapter is documented Ecowitt-first surface", () => {
  const ADAPTER = readFileSync(
    resolve(__dirname, "..", "lib/ecowittPayloadAdapter.ts"),
    "utf8",
  );

  it("does not import the Supabase client or write directly", () => {
    expect(ADAPTER).not.toMatch(/@\/integrations\/supabase/);
    expect(ADAPTER).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });

  it("contains no device-control or automation strings", () => {
    expect(ADAPTER).not.toMatch(/service_role/);
    expect(ADAPTER).not.toMatch(/autopilot/i);
    expect(ADAPTER).not.toMatch(/_executed\b/);
    expect(ADAPTER).not.toMatch(/device[-_ ]command/i);
  });
});

describe("Landing positions Ecowitt-first hardware support", () => {
  const LANDING = readFileSync(
    resolve(__dirname, "..", "pages/Landing.tsx"),
    "utf8",
  );
  it("mentions hardware-neutral / hardware integrations path", () => {
    expect(LANDING).toMatch(/[Hh]ardware/);
  });
  it("does not silently re-introduce a 'Live sensor' badge in copy", () => {
    // We do not forbid the word entirely (legitimate elsewhere), but Landing
    // should not market unknown source data as 'Live'.
    expect(LANDING).not.toMatch(/badge="Live"/);
    expect(LANDING).not.toMatch(/\|\|\s*["']Live["']/);
  });
});
