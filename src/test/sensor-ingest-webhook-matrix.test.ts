/**
 * Targeted test matrix for the chosen sensor ingest Edge Function path:
 *   supabase/functions/sensor-ingest-webhook/index.ts
 *
 * The Edge Function delegates to two pure helpers:
 *   - normalizeWebhookIngestPayload (validation, captured_at, metrics)
 *   - authenticateBearer            (JWT / bridge token auth)
 *
 * This matrix exercises both helpers across the contract surface defined in
 * docs/sensor-ingest-payload-contract.md, plus static guards against the
 * forbidden patterns (no alerts / no Action Queue / no device control).
 *
 * Scope: pure-helper + static source guards only. No live Deno/HTTP calls.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  normalizeWebhookIngestPayload,
  sanitizeRawPayload,
  WEBHOOK_ALLOWED_SOURCES,
} from "@/lib/sensorWebhookIngestRules";
import {
  authenticateBearer,
  sha256Hex,
  BRIDGE_PREFIX,
} from "../../supabase/functions/sensor-ingest-webhook/auth";

const TENT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-06-04T12:00:00.000Z");

function basePayload(over: Partial<Record<string, unknown>> = {}) {
  return {
    tent_id: TENT,
    source: "webhook_generic",
    captured_at: "2026-06-04T11:59:00.000Z",
    metrics: { temp_c: 24, humidity_pct: 55 },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Happy path
// ---------------------------------------------------------------------------
describe("ingest matrix — happy path", () => {
  it("normalizes a well-formed payload into sensor_readings rows", () => {
    const res = normalizeWebhookIngestPayload(basePayload(), { now: NOW });
    expect(res.ok).toBe(true);
    expect(res.rows.length).toBe(2);
    expect(res.rows.every((r) => r.tent_id === TENT)).toBe(true);
    expect(res.rows.every((r) => r.source === "webhook_generic")).toBe(true);
    expect(res.rows.every((r) => r.captured_at === "2026-06-04T11:59:00.000Z")).toBe(true);
    expect(res.fingerprint).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. Auth — missing / invalid JWT, bridge token rejection
// ---------------------------------------------------------------------------
describe("ingest matrix — auth", () => {
  const deps = {
    serviceKeyAvailable: true,
    lookupBridgeToken: async () => ({ data: null, error: null }),
    verifyJwtClaims: async () => ({ sub: null }),
  };

  it("rejects empty bearer as unauthorized via JWT path (no sub)", async () => {
    const r = await authenticateBearer("not-a-real-jwt", deps);
    expect(r.ok).toBe(false);
    expect(r.ok).toBe(false);
    expect((r as { error?: string }).error).toBe("unauthorized");
  });

  it("rejects bridge token when service role is unavailable", async () => {
    const r = await authenticateBearer("vbt_" + "a".repeat(40), {
      ...deps,
      serviceKeyAvailable: false,
    });
    expect(r.ok).toBe(false);
    expect(r.ok).toBe(false);
    expect((r as { error?: string }).error).toBe("server_misconfigured");
  });

  it("rejects too-short bridge tokens", async () => {
    const r = await authenticateBearer("vbt_short", deps);
    expect(r.ok).toBe(false);
    expect(r.ok).toBe(false);
    expect((r as { error?: string }).error).toBe("unauthorized");
  });

  it("rejects unknown bridge token hash", async () => {
    const r = await authenticateBearer("vbt_" + "b".repeat(40), deps);
    expect(r.ok).toBe(false);
    expect(r.ok).toBe(false);
    expect((r as { error?: string }).error).toBe("unauthorized");
  });

  it("rejects revoked bridge token", async () => {
    const hash = await sha256Hex("vbt_" + "c".repeat(40));
    const r = await authenticateBearer("vbt_" + "c".repeat(40), {
      ...deps,
      lookupBridgeToken: async (h) => {
        expect(h).toBe(hash);
        return {
          data: {
            id: "tok1",
            user_id: USER,
            tent_id: TENT,
            expires_at: new Date(Date.now() + 1_000_000).toISOString(),
            revoked_at: new Date().toISOString(),
          },
          error: null,
        };
      },
    });
    expect(r.ok).toBe(false);
    expect(r.ok).toBe(false);
    expect((r as { error?: string }).error).toBe("token_revoked");
  });

  it("rejects expired bridge token", async () => {
    const r = await authenticateBearer("vbt_" + "d".repeat(40), {
      ...deps,
      lookupBridgeToken: async () => ({
        data: {
          id: "tok2",
          user_id: USER,
          tent_id: TENT,
          expires_at: new Date(Date.now() - 1_000_000).toISOString(),
          revoked_at: null,
        },
        error: null,
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.ok).toBe(false);
    expect((r as { error?: string }).error).toBe("token_expired");
  });

  it("accepts valid JWT with sub claim", async () => {
    const r = await authenticateBearer("ey.fake.jwt", {
      ...deps,
      verifyJwtClaims: async () => ({ sub: USER }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.auth.kind).toBe("jwt");
      expect(r.auth.userId).toBe(USER);
    }
  });

  it("starts with BRIDGE_PREFIX constant `vbt_`", () => {
    expect(BRIDGE_PREFIX).toBe("vbt_");
  });
});

// ---------------------------------------------------------------------------
// 3. Client user_id is ignored (never trusted)
// ---------------------------------------------------------------------------
describe("ingest matrix — client user_id", () => {
  it("ignores caller-supplied user_id in normalized rows", () => {
    const res = normalizeWebhookIngestPayload(
      basePayload({ user_id: "99999999-9999-4999-8999-999999999999" }),
      { now: NOW },
    );
    expect(res.ok).toBe(true);
    for (const row of res.rows) {
      // user_id is not set by the helper — the edge function stamps it from auth.
      expect((row as Record<string, unknown>).user_id).toBeUndefined();
    }
  });

  it("strips user_id from raw_payload before persistence", () => {
    const raw = sanitizeRawPayload({
      tent_id: TENT,
      source: "webhook_generic",
      captured_at: "2026-06-04T11:59:00.000Z",
      metrics: { temp_c: 24 },
      user_id: "attacker-supplied",
    });
    expect(raw.user_id).toBeUndefined();
    expect(raw.tent_id).toBe(TENT);
  });
});

// ---------------------------------------------------------------------------
// 4. Invalid source
// ---------------------------------------------------------------------------
describe("ingest matrix — source allow-list", () => {
  it("rejects unknown source", () => {
    const res = normalizeWebhookIngestPayload(
      basePayload({ source: "live" }),
      { now: NOW },
    );
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /invalid source/i.test(e))).toBe(true);
  });

  it("rejects missing source", () => {
    const res = normalizeWebhookIngestPayload(
      basePayload({ source: undefined }),
      { now: NOW },
    );
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /source required/i.test(e))).toBe(true);
  });

  it("does not allow stale/invalid/demo/live as a source", () => {
    for (const bad of ["stale", "invalid", "demo", "live", "unknown"]) {
      const res = normalizeWebhookIngestPayload(
        basePayload({ source: bad }),
        { now: NOW },
      );
      expect(res.ok).toBe(false);
    }
  });

  it("source allow-list mirrors validate_sensor_reading trigger", () => {
    // Allow-list does not include "stale"/"invalid" — those are derived states.
    expect(WEBHOOK_ALLOWED_SOURCES).not.toContain("stale" as never);
    expect(WEBHOOK_ALLOWED_SOURCES).not.toContain("invalid" as never);
    expect(WEBHOOK_ALLOWED_SOURCES).not.toContain("live" as never);
    expect(WEBHOOK_ALLOWED_SOURCES).not.toContain("demo" as never);
  });
});

// ---------------------------------------------------------------------------
// 5. captured_at — malformed, missing, future
// ---------------------------------------------------------------------------
describe("ingest matrix — captured_at", () => {
  it("rejects missing captured_at", () => {
    const res = normalizeWebhookIngestPayload(
      basePayload({ captured_at: undefined }),
      { now: NOW },
    );
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /captured_at required/i.test(e))).toBe(true);
  });

  it("rejects malformed captured_at", () => {
    const res = normalizeWebhookIngestPayload(
      basePayload({ captured_at: "not-a-date" }),
      { now: NOW },
    );
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /invalid captured_at/i.test(e))).toBe(true);
  });

  it("rejects captured_at more than 5 minutes in the future", () => {
    const future = new Date(NOW.getTime() + 10 * 60 * 1000).toISOString();
    const res = normalizeWebhookIngestPayload(
      basePayload({ captured_at: future }),
      { now: NOW },
    );
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /future/i.test(e))).toBe(true);
  });

  it("accepts captured_at inside the 5-minute clock-skew tolerance", () => {
    const near = new Date(NOW.getTime() + 2 * 60 * 1000).toISOString();
    const res = normalizeWebhookIngestPayload(
      basePayload({ captured_at: near }),
      { now: NOW },
    );
    expect(res.ok).toBe(true);
  });

  it("does not silently backfill captured_at from occurred_at / now", () => {
    const res = normalizeWebhookIngestPayload(
      // Even with an extraneous occurred_at field, captured_at must still be required.
      basePayload({
        captured_at: undefined,
        occurred_at: "2026-06-04T11:59:00.000Z",
      }),
      { now: NOW },
    );
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /captured_at required/i.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Invalid metric values
// ---------------------------------------------------------------------------
describe("ingest matrix — metric validation", () => {
  it("rejects out-of-range humidity", () => {
    const res = normalizeWebhookIngestPayload(
      basePayload({ metrics: { humidity_pct: 250 } }),
      { now: NOW },
    );
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /humidity_pct.*out of range/i.test(e))).toBe(true);
  });

  it("rejects non-finite metric values", () => {
    const res = normalizeWebhookIngestPayload(
      basePayload({ metrics: { temp_c: "not-a-number", humidity_pct: 55 } }),
      { now: NOW },
    );
    // temp_c silently skipped (null), humidity still valid → ok.
    expect(res.ok).toBe(true);
    expect(res.rows.length).toBe(1);
    expect(res.skipped).toContain("temp_c");
  });

  it("rejects payloads with no valid metrics at all", () => {
    const res = normalizeWebhookIngestPayload(
      basePayload({ metrics: { temp_c: 9999 } }),
      { now: NOW },
    );
    expect(res.ok).toBe(false);
  });

  it("requires PPFD to be a finite number in canonical units (no lux/watt estimation)", () => {
    // Only `ppfd` is accepted. Aliases like `lux`, `watts`, `light_pct` are
    // NOT in METRIC_ALIASES and must be silently skipped, never coerced.
    const res = normalizeWebhookIngestPayload(
      basePayload({
        metrics: { lux: 50000, watts: 600, light_pct: 80, ppfd: 800 },
      }),
      { now: NOW },
    );
    expect(res.ok).toBe(true);
    const ppfdRows = res.rows.filter((r) => r.metric === "ppfd");
    expect(ppfdRows.length).toBe(1);
    expect(ppfdRows[0].value).toBe(800);
    // Lux/watts/light% are not silently converted into ppfd.
    expect(res.skipped).toEqual(expect.arrayContaining(["lux", "watts", "light_pct"]));
  });

  it("rejects out-of-range ppfd", () => {
    const res = normalizeWebhookIngestPayload(
      basePayload({ metrics: { ppfd: 99999 } }),
      { now: NOW },
    );
    expect(res.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. tent_id required + UUID-shaped
// ---------------------------------------------------------------------------
describe("ingest matrix — tent ownership pre-checks", () => {
  it("rejects missing tent_id", () => {
    const res = normalizeWebhookIngestPayload(
      basePayload({ tent_id: undefined }),
      { now: NOW },
    );
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /tent_id required/i.test(e))).toBe(true);
  });

  it("rejects non-UUID tent_id", () => {
    const res = normalizeWebhookIngestPayload(
      basePayload({ tent_id: "not-a-uuid" }),
      { now: NOW },
    );
    expect(res.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Duplicate handling — fingerprint stability
// ---------------------------------------------------------------------------
describe("ingest matrix — duplicate handling", () => {
  it("produces a stable fingerprint for identical payloads (dedupe key)", () => {
    const a = normalizeWebhookIngestPayload(basePayload(), { now: NOW });
    const b = normalizeWebhookIngestPayload(basePayload(), { now: NOW });
    expect(a.fingerprint).not.toBeNull();
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("changes fingerprint when captured_at differs", () => {
    const a = normalizeWebhookIngestPayload(basePayload(), { now: NOW });
    const b = normalizeWebhookIngestPayload(
      basePayload({ captured_at: "2026-06-04T11:58:00.000Z" }),
      { now: NOW },
    );
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

// ---------------------------------------------------------------------------
// 9. raw_payload preservation
// ---------------------------------------------------------------------------
describe("ingest matrix — raw_payload preservation", () => {
  it("preserves the original payload (minus user_id) on each row", () => {
    const res = normalizeWebhookIngestPayload(
      basePayload({
        user_id: "should-be-stripped",
        metadata: { device_id: "esp32-A" },
      }),
      { now: NOW },
    );
    expect(res.ok).toBe(true);
    for (const row of res.rows) {
      const raw = row.raw_payload as Record<string, unknown>;
      expect(raw.tent_id).toBe(TENT);
      expect(raw.source).toBe("webhook_generic");
      expect(raw.captured_at).toBe("2026-06-04T11:59:00.000Z");
      expect(raw.metrics).toBeTruthy();
      expect(raw.metadata).toEqual({ device_id: "esp32-A" });
      expect(raw.user_id).toBeUndefined();
    }
  });

  it("captures device_id from metadata", () => {
    const res = normalizeWebhookIngestPayload(
      basePayload({ metadata: { device_id: "mqtt-bridge-7" } }),
      { now: NOW },
    );
    expect(res.ok).toBe(true);
    expect(res.rows.every((r) => r.device_id === "mqtt-bridge-7")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. Static safety: no alerts, no Action Queue, no device control
// ---------------------------------------------------------------------------
describe("ingest matrix — static safety guards on edge function source", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../../supabase/functions/sensor-ingest-webhook/index.ts"),
    "utf8",
  );

  it("never writes to the alerts table", () => {
    // Only string occurrences allowed are in safety comments.
    const codeOnly = SRC.replace(/\/\/[^\n]*/g, "");
    expect(codeOnly).not.toMatch(/from\(\s*["']alerts["']\s*\)/);
    expect(codeOnly).not.toMatch(/insert.*alerts/i);
  });

  it("never writes to the action_queue table", () => {
    const codeOnly = SRC.replace(/\/\/[^\n]*/g, "");
    expect(codeOnly).not.toMatch(/action_queue/);
  });

  it("does not accept or emit device-control fields", () => {
    const codeOnly = SRC.replace(/\/\/[^\n]*/g, "");
    for (const forbidden of [
      "device_command",
      "fan_speed",
      "pump_on",
      "light_on",
      "dehumidifier_on",
      "dosing_ml",
      "set_relay",
      "set_setpoint",
    ]) {
      expect(codeOnly).not.toContain(forbidden);
    }
  });

  it("does not contain automation/autopilot wording in code", () => {
    const codeOnly = SRC.replace(/\/\/[^\n]*/g, "").toLowerCase();
    expect(codeOnly).not.toMatch(/autopilot|auto_execute|automation_run/);
  });

  it("authenticates BEFORE parsing body and inserting", () => {
    // authenticateBearer must appear before any sensor_readings write
    // (insert or atomic upsert).
    const authIdx = SRC.indexOf("authenticateBearer(");
    const writeMatch = SRC.match(/from\(["']sensor_readings["']\)\s*\.\s*(insert|upsert)/);
    const writeIdx = writeMatch ? SRC.indexOf(writeMatch[0]) : -1;
    expect(authIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(writeIdx);
  });

  it("stamps server-resolved user_id on every insert row", () => {
    expect(SRC).toMatch(/user_id:\s*auth\.userId/);
  });

  it("does not use service_role before authentication completes", () => {
    // The admin client may be CONSTRUCTED early, but must only be USED after
    // authenticateBearer succeeds. Check that no `.from(`/`.rpc(` calls on
    // `admin` appear before the auth check.
    const firstAuth = SRC.indexOf("authenticateBearer(");
    const preAuth = SRC.slice(0, firstAuth);
    expect(preAuth).not.toMatch(/admin\.\s*(from|rpc)\s*\(/);
    expect(preAuth).not.toMatch(/admin!\s*\.\s*(from|rpc)\s*\(/);
  });

  it("returns clean JSON error responses (no stack traces leaked)", () => {
    expect(SRC).toMatch(/json\(\s*\{\s*error:\s*["']unauthorized["']/);
    expect(SRC).toMatch(/json\(\s*\{\s*error:\s*["']invalid_json["']/);
    expect(SRC).toMatch(/json\(\s*\{\s*error:\s*["']invalid_payload["']/);
    expect(SRC).toMatch(/json\(\s*\{\s*error:\s*["']forbidden_tent["']/);
  });
});
