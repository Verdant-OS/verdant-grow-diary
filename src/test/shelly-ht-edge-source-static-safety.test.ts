/**
 * Static safety scan for the restored Shelly H&T edge function source files.
 *
 * Confirms the runtime contracts the rest of the codebase relies on:
 *   - status: token never leaves the server in plaintext (mask only)
 *   - webhook: observe-only ingest — no Action Queue writes, no device
 *     control, no automation, no token reflection in responses
 *
 * Read-only scan. No deploy, no network, no schema changes.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const STATUS_SRC = resolve(ROOT, "supabase/functions/shelly-ht-status/index.ts");
const WEBHOOK_SRC = resolve(ROOT, "supabase/functions/shelly-ht-webhook/index.ts");

describe("Shelly H&T edge function source — presence", () => {
  it("status source file exists", () => {
    expect(existsSync(STATUS_SRC)).toBe(true);
  });
  it("webhook source file exists", () => {
    expect(existsSync(WEBHOOK_SRC)).toBe(true);
  });
});

describe("shelly-ht-status static safety", () => {
  const src = readFileSync(STATUS_SRC, "utf8");

  it("requires an Authorization header (caller JWT)", () => {
    expect(src).toMatch(/authorization/i);
  });

  it("returns a masked token, never the raw value", () => {
    expect(src).toMatch(/maskToken/);
    expect(src).toMatch(/tokenMask/);
  });

  it("does not write to action_queue", () => {
    expect(src).not.toMatch(/action_queue/);
  });

  it("does not perform device control or automation language", () => {
    expect(src).not.toMatch(/relay|actuator|device_command|automation|execute/i);
  });

  it("does not embed hardcoded secret material", () => {
    // Tokens/keys are read from Deno.env only.
    expect(src).toMatch(/Deno\.env\.get\("SHELLY_HT_WEBHOOK_TOKEN"\)/);
    expect(src).not.toMatch(/SHELLY_HT_WEBHOOK_TOKEN\s*=\s*["'][^"']+["']/);
  });
});

describe("shelly-ht-webhook static safety", () => {
  const src = readFileSync(WEBHOOK_SRC, "utf8");

  it("is observe-only: no action_queue writes", () => {
    expect(src).not.toMatch(/action_queue/);
  });

  it("only writes to sensor_readings", () => {
    const inserts = Array.from(src.matchAll(/\.from\(["']([a-z_]+)["']\)\s*\.insert/g)).map(
      (m) => m[1],
    );
    // The only insert target is sensor_readings; tent lookup uses select.
    expect(inserts.every((t) => t === "sensor_readings")).toBe(true);
  });

  it("does not control devices or run automation", () => {
    expect(src).not.toMatch(/relay|actuator|device_command|automation|notify\(|push\s*notification/i);
  });

  it("never trusts client-supplied tent_id or user_id", () => {
    // tent_id comes from server env; user_id comes from tents.user_id lookup.
    expect(src).toMatch(/SHELLY_HT_TENT_ID/);
    expect(src).toMatch(/tents/);
    expect(src).toMatch(/tent\.user_id/);
    // Defensive: the payload's own tent_id/user_id must NOT be assigned into rows.
    expect(src).not.toMatch(/tent_id:\s*payload\./);
    expect(src).not.toMatch(/user_id:\s*payload\./);
  });

  it("compares webhook tokens in constant time", () => {
    expect(src).toMatch(/constantTimeEqual/);
  });

  it("does not reflect the configured token in responses", () => {
    // Responses are the fixed ACK literal; the expected token is never
    // serialized back to the caller.
    expect(src).toMatch(/status:\s*"received"/);
    expect(src).not.toMatch(/JSON\.stringify\([^)]*expected/);
  });

  it("does not embed hardcoded secret material", () => {
    expect(src).toMatch(/Deno\.env\.get\("SHELLY_HT_WEBHOOK_TOKEN"\)/);
    expect(src).not.toMatch(/SHELLY_HT_WEBHOOK_TOKEN\s*=\s*["'][^"']+["']/);
  });

  it("uses the documented sensor source label", () => {
    expect(src).toMatch(/source:\s*"pi_bridge"/);
  });
});
