/**
 * Static documentation tests for the generic bridge client guide
 * (EcoWitt / Home Assistant / MQTT). Enforces that safety-critical
 * phrasing — read-only, no service_role, no user_id, no device
 * commands, idempotency, Full Jitter retry — cannot silently drift.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(__dirname, "../../docs/generic-bridge-client-guide.md");

describe("generic-bridge-client-guide.md", () => {
  it("exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const doc = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
  const lower = doc.toLowerCase();

  it("documents the canonical sensor-ingest-webhook endpoint", () => {
    expect(doc).toContain("sensor-ingest-webhook");
    expect(doc).toMatch(/POST\s+\{?SUPABASE_URL\}?\/functions\/v1\/sensor-ingest-webhook/);
  });

  it("requires bridge token auth (vbt_...)", () => {
    expect(doc).toMatch(/Authorization:\s*Bearer\s+vbt_/);
  });

  it("requires Idempotency-Key header for bridges", () => {
    expect(doc).toContain("Idempotency-Key");
    expect(lower).toMatch(/idempotency.*required|must send.*idempotency/);
  });

  it("shows EcoWitt-over-MQTT example", () => {
    expect(doc).toMatch(/"source":\s*"mqtt"[\s\S]*"vendor":\s*"ecowitt"/);
  });

  it("shows Home Assistant webhook example", () => {
    expect(doc).toMatch(/"source":\s*"webhook"[\s\S]*"vendor":\s*"home_assistant"/);
  });

  it("shows a generic MQTT example", () => {
    expect(doc).toMatch(/"source":\s*"mqtt"/);
  });

  it("explains vendor is lineage only and never used for auth", () => {
    expect(lower).toMatch(/lineage only|lineage-only/);
    expect(lower).toMatch(/never.*used for auth|not.*used for auth/);
  });

  it("warns against lux-converted PPFD", () => {
    expect(lower).toMatch(/lux/);
    expect(lower).toMatch(/do not send lux-converted ppfd|not.*synthesize ppfd|not fabricate/);
  });

  it("documents Full Jitter retry policy", () => {
    expect(lower).toContain("full jitter");
    expect(doc).toMatch(/random\(0,\s*min\(maxDelay,\s*baseDelay\s*\*\s*2\s*\*\*\s*attempt\)\)/);
    expect(lower).toMatch(/max retries.*4|max retries:\s*4/);
    expect(lower).toMatch(/timeout.*10.{0,3}15/);
    expect(lower).toMatch(/never retry in a tight loop|never retry forever/);
  });

  it("documents sensor truth rules", () => {
    expect(lower).toContain("captured_at");
    expect(lower).toContain("raw_payload");
    expect(lower).toMatch(/never fake live data/);
    expect(lower).toMatch(/stale|invalid/);
  });

  it("forbids service_role, user_id, device commands, alerts, action queue", () => {
    expect(lower).toMatch(/no\s+`?service_role`?|never.*service_role/);
    expect(lower).toMatch(/no\s+`?user_id`?\s+in the payload|no user_id/);
    expect(lower).toMatch(/no device commands|device control is \*\*out of scope\*\*|device control.*out of scope/);
    expect(lower).toMatch(/no alert/);
    expect(lower).toMatch(/no action queue/);
  });

  it("does not include real-looking secrets", () => {
    expect(doc).not.toMatch(/eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/);
    expect(doc).not.toMatch(/vbt_[A-Za-z0-9]{24,}/);
    expect(doc).not.toMatch(/service_role\s*[:=]\s*['"]/);
  });
});
