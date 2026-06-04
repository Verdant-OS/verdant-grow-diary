/**
 * Static documentation tests for the EcoWitt-over-MQTT and Home
 * Assistant webhook field mapping guide. Enforces that safety-critical
 * phrasing and required mapping rows cannot silently drift.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC = resolve(__dirname, "../../docs/sensor-ecowitt-home-assistant-field-mapping.md");

describe("sensor-ecowitt-home-assistant-field-mapping.md", () => {
  it("exists", () => {
    expect(existsSync(DOC)).toBe(true);
  });

  const doc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  const lower = doc.toLowerCase();

  it("documents sensor-ingest-webhook as the canonical endpoint", () => {
    expect(doc).toContain("sensor-ingest-webhook");
  });

  it("requires bridge token auth and Idempotency-Key", () => {
    expect(doc).toMatch(/Authorization:\s*Bearer\s+vbt_/);
    expect(doc).toContain("Idempotency-Key");
  });

  it("includes EcoWitt-over-MQTT example with source mqtt + vendor ecowitt", () => {
    expect(doc).toMatch(/"source":\s*"mqtt"[\s\S]*"vendor":\s*"ecowitt"/);
  });

  it("includes Home Assistant example with source webhook + vendor home_assistant", () => {
    expect(doc).toMatch(/"source":\s*"webhook"[\s\S]*"vendor":\s*"home_assistant"/);
  });

  it("includes copy/paste examples for temp, humidity, VPD, soil moisture, CO2, PPFD", () => {
    expect(lower).toContain("temperature");
    expect(lower).toContain("humidity");
    expect(lower).toContain("vpd");
    expect(lower).toContain("soil");
    expect(lower).toContain("co₂");
    expect(lower).toContain("ppfd");
  });

  it("warns against lux→PPFD conversion", () => {
    expect(lower).toMatch(/lux.*ppfd|do not lux-convert|do not map to ppfd/);
  });

  it("says vendor is lineage only and never used for auth", () => {
    expect(lower).toMatch(/lineage only|lineage-only/);
    expect(lower).toMatch(/never used for auth|never trusted for auth/);
  });

  it("says user_id must never be trusted from the payload", () => {
    expect(lower).toMatch(/never (trust|send) `?user_id`?|never.*user_id.*from the payload/);
  });

  it("says bridge clients must preserve captured_at and raw_payload", () => {
    expect(lower).toMatch(/preserve `?captured_at`?/);
    expect(lower).toMatch(/preserve `?raw_payload`?/);
  });

  it("forbids device commands, alerts, and Action Queue writes", () => {
    expect(lower).toMatch(/no device commands/);
    expect(lower).toMatch(/no alerts/);
    expect(lower).toMatch(/no action queue/);
  });

  it("does not embed real-looking secrets", () => {
    expect(doc).not.toMatch(/eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/);
    expect(doc).not.toMatch(/vbt_[A-Za-z0-9]{24,}/);
    expect(doc).not.toMatch(/service_role\s*[:=]\s*['"]/);
  });
});
