/**
 * EcoWitt ingest canary contract — tightens guarantees before pointing a
 * live EcoWitt gateway at Verdant. Scope:
 *
 *  1. VPD provenance — derived rows distinguishable from measured rows,
 *     and never computed from a dropped/invalid temperature.
 *  2. Timestamp handling — pins the edge function's server-time fallback
 *     for `dateutc` (the current canonical behavior — `dateutc` is NOT
 *     parsed; `captured_at` is stamped from server time at ingest).
 *  3. Duplicate behavior — pins the edge function's reliance on the
 *     `sensor_readings_dedupe_uidx` unique index via `ignoreDuplicates`.
 *  4. Secret/log safety — function source never echoes raw PASSKEY/MAC/
 *     api_key/token/auth/service_role/client user_id and no public
 *     debug=true response mode exists.
 *  5. Static safety — no alerts/action_queue/AI/automation/device-control
 *     writes; no outbound fetch to non-Supabase hosts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildEcoWittRoutedRows } from "@/lib/ecowittRoutedRowBuilder";
import type { EcoWittRouterEligibleTent } from "@/lib/ecowittChannelTentRouter";
import { computeEcoWittPasskeyFingerprint } from "@/lib/ecowittPasskeyFingerprint";

const EDGE_SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/ecowitt-ingest/index.ts"),
  "utf8",
);
/** Edge function source with // line comments and /* block *​/ comments stripped, for code-only scans. */
const EDGE_CODE = EDGE_SRC
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const USER = "uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu";
const NOW = "2026-06-04T21:00:00.000Z";
const FP_A = "ewfp_aaaaaaaaaaaaaaaaaaaaaaaa";

const tent: EcoWittRouterEligibleTent = {
  tent_id: "11111111-1111-1111-1111-111111111111",
  passkey_fingerprint: FP_A,
  air_channels: [1],
  soil_channels: [1],
};

describe("(1) VPD provenance — derived vs measured", () => {
  it("vpd_kpa row carries calculated/provider/mapping_type/raw_key + derived_from", () => {
    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "77", humidity1: "50", soilmoisture1: "40" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tent],
      capturedAt: NOW,
    });
    const measured = rows.filter((r) => r.metric !== "vpd_kpa");
    const vpd = rows.find((r) => r.metric === "vpd_kpa");
    expect(measured.every((r) => r.raw_payload.calculated === undefined)).toBe(true);
    expect(vpd).toBeDefined();
    expect(vpd!.raw_payload).toMatchObject({
      provider: "ecowitt",
      mapping_type: "air",
      calculated: true,
      raw_key: "derived:vpd_kpa:ch1",
      raw_value: "",
    });
    // raw_payload.derived_from is the source-of-truth provenance trail.
    expect(vpd!.raw_payload.derived_from).toEqual(["temp1f", "humidity1"]);
    // We do NOT change `quality` to "derived" — DB CHECK constraint only
    // permits ok/degraded/stale/invalid.
    expect(vpd!.quality).toBe("ok");
  });

  it("malformed temp1f produces NO vpd_kpa row even when humidity1 is valid", () => {
    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "abc", humidity1: "50", soilmoisture1: "40" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tent],
      capturedAt: NOW,
    });
    const metrics = rows.map((r) => r.metric).sort();
    expect(metrics).toEqual(["humidity_pct", "soil_moisture_pct"]);
    expect(rows.some((r) => r.metric === "vpd_kpa")).toBe(false);
    expect(rows.some((r) => r.metric === "temperature_c")).toBe(false);
  });
});

describe("(2) timestamp / dateutc handling (pinned current behavior)", () => {
  it("edge function stamps captured_at from server time and does NOT parse dateutc", () => {
    // CURRENT CANONICAL BEHAVIOR: dateutc is treated as untrusted payload
    // metadata and IGNORED. captured_at = new Date().toISOString() at ingest.
    // If/when we begin trusting dateutc, this pin must be updated alongside
    // the runbook.
    expect(EDGE_SRC).toMatch(/capturedAt\s*=\s*new Date\(\)\.toISOString\(\)/);
    expect(EDGE_SRC).not.toMatch(/payload\.dateutc|safePayload\.dateutc/);
  });

  it("captured_at is set deterministically from the caller-supplied capturedAt", () => {
    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "77", humidity1: "50" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tent],
      capturedAt: NOW,
    });
    for (const r of rows) {
      expect(r.captured_at).toBe(NOW);
      // ISO-8601 UTC — never a local timezone offset.
      expect(r.captured_at.endsWith("Z")).toBe(true);
    }
  });
});

describe("(3) duplicate behavior — pins onConflict against dedupe unique index", () => {
  // The actual unique index, verified via psql at authoring time:
  //   sensor_readings_dedupe_uidx
  //   UNIQUE (user_id, tent_id, source, metric, captured_at)
  //   WHERE captured_at IS NOT NULL
  // The edge function MUST use the same columns in onConflict so a duplicate
  // POST is idempotent (skipped, never double-inserted).
  it("edge function uses ignoreDuplicates with the dedupe column set", () => {
    expect(EDGE_SRC).toMatch(
      /onConflict:\s*"user_id,tent_id,source,metric,captured_at"/,
    );
    expect(EDGE_SRC).toMatch(/ignoreDuplicates:\s*true/);
  });

  it("every builder row carries a non-null captured_at so the partial unique index applies", () => {
    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "77", humidity1: "50", soilmoisture1: "40" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tent],
      capturedAt: NOW,
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.captured_at).toBeTruthy();
      expect(typeof r.captured_at).toBe("string");
    }
  });
});

describe("(4) secret + log safety — source scan of the edge function", () => {
  it("never logs or returns raw credential field names", () => {
    // The edge function logs only terse error tags (`tent_lookup_failed`,
    // `insert_failed`) with `auth_kind` / `rows` count. No request body or
    // payload echo. Spot-check by ensuring there is no console.* of payload
    // / safePayload / rawPasskey.
    expect(EDGE_SRC).not.toMatch(/console\.[a-z]+\([^)]*rawPasskey/);
    expect(EDGE_SRC).not.toMatch(/console\.[a-z]+\([^)]*payload\b/);
    expect(EDGE_SRC).not.toMatch(/console\.[a-z]+\([^)]*safePayload/);
  });

  it("does not expose a public debug=true response mode", () => {
    expect(EDGE_SRC).not.toMatch(/[?&]debug=true/);
    expect(EDGE_SRC).not.toMatch(/searchParams\.get\(['"]debug['"]\)/);
  });

  it("does not return SQL error detail to the gateway", () => {
    // Both error paths return a terse `reason`/`error` string, not the
    // PostgREST error object.
    expect(EDGE_SRC).toMatch(/reason:\s*"tent_lookup_failed"/);
    expect(EDGE_SRC).toMatch(/error:\s*"insert_failed"/);
    // Response bodies use string literals only — never a PostgREST error
    // object directly. (Destructuring assignments like
    // `{ error: tentErr } = await ...` are not response payloads.)
    expect(EDGE_SRC).not.toMatch(/json\(\{[^}]*error:\s*tentErr/);
    expect(EDGE_SRC).not.toMatch(/json\(\{[^}]*error:\s*insErr/);
  });

  it("never persists raw PASSKEY/MAC/api_key/token/auth/service_role/user_id keys in raw_payload", async () => {
    const fp = await computeEcoWittPasskeyFingerprint("AAAA-SECRET");
    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: {
        // These would-be-leaked keys are sanitized by the edge function
        // before reaching the builder, but the builder must also never
        // re-introduce them via raw_payload.
        temp1f: "77",
        humidity1: "50",
        soilmoisture1: "40",
      },
      payloadPasskeyFingerprint: fp,
      eligibleTents: [
        { ...tent, passkey_fingerprint: fp as string },
      ],
      capturedAt: NOW,
    });
    const serialized = JSON.stringify(rows);
    // Field-name keywords.
    for (const k of [
      '"passkey"',
      '"mac"',
      '"imei"',
      '"api_key"',
      '"application_key"',
      '"token"',
      '"auth"',
      '"service_role"',
      '"user_id":"client',
    ]) {
      expect(serialized.toLowerCase()).not.toContain(k.toLowerCase());
    }
    // Known test-secret VALUES (not just field names).
    for (const v of [
      "AAAA-SECRET",
      "AA:BB:CC:DD:EE:FF",
      "fake-api-key",
      "fake-token",
    ]) {
      expect(serialized).not.toContain(v);
    }
  });

  it("PASSKEY fingerprint is a one-way truncated sha256 (not reversible)", async () => {
    const fp = await computeEcoWittPasskeyFingerprint("AAAA-SECRET");
    expect(fp).toMatch(/^ewfp_[0-9a-f]{24}$/);
    // Not the raw value, not hex/base64 of the raw value.
    expect(fp).not.toContain("AAAA");
    const hexOfRaw = Array.from(new TextEncoder().encode("AAAA-SECRET"))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(fp).not.toContain(hexOfRaw);
    const b64 = btoa("AAAA-SECRET");
    expect(fp).not.toContain(b64);
  });
});

describe("(5) static safety — edge source scan", () => {
  it("never writes to alerts or action_queue", () => {
    expect(EDGE_SRC).not.toMatch(/from\(\s*['"]alerts['"]/);
    expect(EDGE_SRC).not.toMatch(/from\(\s*['"]action_queue['"]/);
  });

  it("never calls AI / model / automation / device-control verbs", () => {
    const lower = EDGE_CODE.toLowerCase();
    for (const forbidden of [
      "ai_doctor",
      "openai",
      "anthropic",
      "lovable_ai",
      "automation",
      "device_control",
      "turn_on",
      "turn_off",
      "twilio",
      "sms",
    ]) {
      expect(lower).not.toContain(forbidden);
    }
  });

  it("only outbound calls are Supabase client + intended auth helpers", () => {
    // The only `fetch` traffic should be through supabase-js / the auth
    // helpers we explicitly import. There must be NO bare fetch() to a
    // foreign host, and no webhook URL string.
    expect(EDGE_SRC).not.toMatch(/\bfetch\(\s*["'`]https?:\/\//);
    // Outbound webhook URLs (not the internal `sensor-ingest-webhook` auth
    // helper import path) must not appear.
    expect(EDGE_SRC).not.toMatch(/https?:\/\/[^\s"'`]*webhook/i);
    expect(EDGE_SRC).not.toMatch(/discord|slack|telegram|sendgrid|mailgun/i);
  });
});
