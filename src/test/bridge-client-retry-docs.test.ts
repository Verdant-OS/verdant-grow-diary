/**
 * Static documentation tests for the Verdant bridge client retry/backoff
 * guidance. These tests enforce that the doc continues to teach safe
 * client behavior (Full Jitter, retry policy, no device control, no
 * real secrets) so the guidance cannot silently drift.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(__dirname, "../../docs/bridge-client-retry-guidance.md");

describe("bridge-client-retry-guidance.md", () => {
  it("exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const doc = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
  const lower = doc.toLowerCase();

  it("mentions Full Jitter", () => {
    expect(lower).toContain("full jitter");
  });

  it("includes the Full Jitter formula", () => {
    expect(doc).toMatch(/random\(0,\s*min\(maxDelay,\s*baseDelay\s*\*\s*2\s*\*\*\s*attempt\)\)/);
  });

  it("warns against tight retry loops", () => {
    expect(lower).toMatch(/tight (retry )?loop/);
    expect(lower).toMatch(/never retry forever|never.*infinite loop|never.*tight loop/);
  });

  it("says device control is out of scope", () => {
    expect(lower).toMatch(/device control is out of scope/);
  });

  it("uses placeholder token format vbt_...", () => {
    expect(doc).toMatch(/vbt_[x\.…a-z]/i);
  });

  it("does not include real-looking secrets", () => {
    // No JWT-shaped tokens, no long base64 secrets.
    expect(doc).not.toMatch(/eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/);
    expect(doc).not.toMatch(/sk_live_[A-Za-z0-9]{16,}/);
    expect(doc).not.toMatch(/vbt_[A-Za-z0-9]{24,}/);
  });

  it("does not include service_role examples", () => {
    expect(lower).toMatch(/never paste.*service_role|do not send.*service_role|never.*service_role/);
    expect(doc).not.toMatch(/service_role\s*[:=]\s*['"]/);
  });

  it("distinguishes source from vendor", () => {
    expect(doc).toMatch(/`source`/);
    expect(doc).toMatch(/`vendor`/);
    expect(lower).toMatch(/source.*vs.*vendor|source` vs `vendor/);
  });

  it("says vendor is lineage-only", () => {
    expect(lower).toMatch(/vendor is \*\*lineage only\*\*|lineage only|lineage-only/);
    expect(lower).toMatch(/never be used for auth/);
  });

  it("says not to retry 400/401/403", () => {
    expect(doc).toMatch(/400/);
    expect(doc).toMatch(/401/);
    expect(doc).toMatch(/403/);
    expect(lower).toMatch(/do \*\*not\*\* retry|do not retry automatically/);
  });

  it("says retry 408/429/5xx/network timeout", () => {
    expect(doc).toMatch(/408/);
    expect(doc).toMatch(/429/);
    expect(doc).toMatch(/5\d\d|500.{0,5}599|500–599|500-599/);
    expect(lower).toContain("network timeout");
  });

  it("includes a Python example", () => {
    expect(doc).toMatch(/```python[\s\S]*requests\.post[\s\S]*```/);
  });

  it("includes ESP32/MicroPython pseudocode", () => {
    expect(lower).toMatch(/esp32.*micropython|micropython/);
    expect(doc).toMatch(/urequests|micropython/i);
  });

  it("includes a Home Assistant rest_command example", () => {
    expect(doc).toContain("rest_command");
    expect(doc).toMatch(/```yaml[\s\S]*verdant_post_reading[\s\S]*```/);
  });

  it("includes Node-RED guidance", () => {
    expect(doc).toMatch(/Node-RED/);
    expect(lower).toMatch(/function node/);
    expect(lower).toMatch(/http request node/);
  });

  it("includes MQTT bridge guidance", () => {
    expect(lower).toMatch(/mqtt bridge/);
    expect(lower).toMatch(/topic names are not auth/);
  });
});
