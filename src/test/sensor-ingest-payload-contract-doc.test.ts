import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(__dirname, "../../docs/sensor-ingest-payload-contract.md");

describe("sensor ingest payload contract doc", () => {
  it("exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const doc = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
  const lower = doc.toLowerCase();

  it("documents canonical payload fields", () => {
    for (const field of [
      "source",
      "vendor",
      "captured_at",
      "tent_id",
      "plant_id",
      "metrics",
      "raw_payload",
      "confidence",
      "bridge_id",
    ]) {
      expect(doc).toContain(field);
    }
  });

  it("lists the supported initial sources", () => {
    for (const src of ["ecowitt", "manual", "csv", "mqtt", "webhook", "stale", "invalid", "unknown"]) {
      expect(lower).toContain(src);
    }
  });

  it("lists required metric keys including PPFD without estimation", () => {
    for (const m of [
      "air_temp_f",
      "temperature",
      "humidity",
      "vpd",
      "co2_ppm",
      "soil_water_content",
      "soil_temp",
      "soil_ec",
      "reservoir_ph",
      "reservoir_ec",
      "ppfd",
    ]) {
      expect(doc).toContain(m);
    }
    expect(lower).toMatch(/ppfd[\s\S]{0,400}(lux|watts|light-%)/);
  });

  it("defines captured_at vs occurred_at rule", () => {
    expect(lower).toContain("captured_at");
    expect(lower).toContain("occurred_at");
    expect(lower).toMatch(/silently|never .* backfill|must not be silently/);
    expect(lower).toMatch(/staleness checks .* use `?captured_at`?/);
  });

  it("defines source-truth rules for Ecowitt, MQTT, manual, CSV", () => {
    expect(lower).toMatch(/ecowitt readings display as \*\*ecowitt\*\*/);
    expect(lower).toMatch(/mqtt readings display as \*\*mqtt\*\* only when `?source = mqtt`?/);
    expect(lower).toContain("manual");
    expect(lower).toContain("csv");
  });

  it("forbids fake-live fallback", () => {
    expect(lower).toMatch(/unknown.{0,40}never render as "live"/);
    expect(lower).toMatch(/no fake-live fallback/);
  });

  it("forbids device control and automation from ingest", () => {
    expect(lower).toContain("no device control");
    expect(lower).toContain("no automation");
  });

  it("forbids automatic alert and Action Queue creation from ingest", () => {
    expect(lower).toContain("no alert creation");
    expect(lower).toContain("no action queue");
  });

  it("requires raw_payload preservation", () => {
    expect(lower).toMatch(/preserve `?raw_payload`?/);
  });

  it("requires idempotency / dedupe", () => {
    expect(lower).toMatch(/idempotency.*dedupe|dedupe/);
  });

  it("forbids trusting client-supplied user_id", () => {
    expect(lower).toMatch(/client-supplied[^\n]{0,20}user_id[^\n]{0,20}must never be trusted/);
  });

  it("forbids service_role bypass before validation", () => {
    expect(lower).toMatch(/no `?service_role`? before validation|service_role.{0,80}must not be used to bypass/);
  });
});
