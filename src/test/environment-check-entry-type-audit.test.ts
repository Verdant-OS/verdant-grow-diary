/**
 * Environment Check Quick Log — integration safety audit (pure / presenter).
 *
 * This test ties together what's already implemented and asserts the
 * user-stated contract:
 *   1. Environment Check is a recognized Quick Log entry type.
 *   2. The save path attaches an `environment_check` envelope (manual
 *      semantics), NEVER under `sensor` and NEVER labeled `csv` / `live`.
 *   3. No raw_payload, secrets, tokens, MACs, passkeys, API keys, JWTs,
 *      bearer tokens, private IDs, or vendor IDs leak into the save
 *      payload OR into the timeline view model.
 *   4. Timeline view model renders Environment Check as "Not live"
 *      (notLive: true, isSensorReading: false).
 *   5. Existing legacy Quick Log event types (watering / observation /
 *      note) remain supported.
 *
 * Pure unit tests — no Supabase, no fetch, no React render, no AI, no
 * Action Queue, no Edge invocation, no device control.
 */
import { describe, it, expect } from "vitest";
import {
  buildLegacyQuickLogUnifiedPayload,
  SUPPORTED_LEGACY_EVENT_TYPES,
  isSupportedLegacyEventType,
} from "@/lib/legacyQuickLogUnifiedSave";
import { buildEnvironmentCheckDetails } from "@/lib/environmentCheckQuickLogRules";
import {
  buildEnvironmentCheckTimelineViewModel,
  isEnvironmentCheckTimelineEntry,
} from "@/lib/environmentCheckTimelineViewModel";

const FORBIDDEN_KEYS = [
  "raw_payload",
  "api_key",
  "apikey",
  "access_token",
  "service_role",
  "bridge_token",
  "passkey",
  "mac",
  "mac_address",
  "jwt",
  "bearer",
  "vendor_id",
];

function stringifyDeep(value: unknown): string {
  return JSON.stringify(value, (_k, v) => v ?? null);
}

function assertNoSecrets(value: unknown): void {
  const json = stringifyDeep(value).toLowerCase();
  for (const needle of FORBIDDEN_KEYS) {
    expect(json).not.toContain(needle);
  }
  // No JWT-shaped tokens.
  expect(json).not.toMatch(/eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/i);
  // No MAC addresses.
  expect(json).not.toMatch(/\b[0-9a-f]{2}(:[0-9a-f]{2}){5}\b/i);
}

describe("Environment Check Quick Log — entry type registration", () => {
  it("is one of the supported legacy Quick Log event types", () => {
    expect(SUPPORTED_LEGACY_EVENT_TYPES).toContain("environment");
    expect(isSupportedLegacyEventType("environment")).toBe(true);
  });

  it("keeps the existing event types available", () => {
    for (const t of ["watering", "observation", "note"] as const) {
      expect(isSupportedLegacyEventType(t)).toBe(true);
    }
  });
});

describe("Environment Check Quick Log — save payload semantics", () => {
  const envelope = buildEnvironmentCheckDetails({
    roomTempF: "75",
    humidityPct: "55",
    vpdKpa: "1.10",
    waterTempValue: "68",
    waterTempUnit: "F",
    ecMscm: "1.8",
    note: "midday env check",
  });

  it("env-check envelope is built and is null-safe", () => {
    expect(envelope).not.toBeNull();
    expect(envelope?.room_temp_f).toBe(75);
    expect(envelope?.humidity_pct).toBe(55);
    expect(envelope?.water_temp_c).not.toBeNull();
  });

  it("save payload routes envelope to p_details.environment_check (manual semantics, not sensor / not csv / not live)", () => {
    const r = buildLegacyQuickLogUnifiedPayload({
      eventType: "environment",
      noteWithHardware: "midday env check",
      plantId: "plant-1",
      plantTentId: "tent-1",
      details: {},
      environmentCheck: envelope as unknown as Record<string, unknown>,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const details = r.payload.p_details as Record<string, unknown> | null;
    expect(details).not.toBeNull();
    expect(details).toHaveProperty("environment_check");
    // CRITICAL: manual env-check is NEVER re-keyed as `sensor`.
    expect(details).not.toHaveProperty("sensor");

    const json = stringifyDeep(r.payload).toLowerCase();
    // Never labels manual env-check as live or csv.
    expect(json).not.toContain('"source":"live"');
    expect(json).not.toContain('"source":"csv"');
    expect(json).not.toContain('"source":"fresh_live"');
    // No automation / device-control verbs in the payload.
    for (const verb of ["publish", "setpoint", "actuate", "relay_on", "relay_off"]) {
      expect(json).not.toContain(verb);
    }
    assertNoSecrets(r.payload);
  });

  it("rejects empty env-check (no note, no measurements) via missing-note guard", () => {
    const empty = buildEnvironmentCheckDetails({});
    expect(empty).toBeNull();
    const r = buildLegacyQuickLogUnifiedPayload({
      eventType: "environment",
      noteWithHardware: "",
      plantId: "plant-1",
      plantTentId: "tent-1",
      details: {},
      environmentCheck: null,
    });
    expect(r.ok).toBe(false);
  });
});

describe("Environment Check Quick Log — timeline rendering", () => {
  const entry = {
    id: "entry-1",
    entry_at: "2026-06-19T12:00:00.000Z",
    event_type: "environment",
    note: "midday env check",
    details: {
      environment_check: {
        room_temp_f: 75,
        humidity_pct: 55,
        vpd_kpa: 1.1,
        water_temp_c: 20,
        water_temp_f: 68,
        ec_mscm: 1.8,
        note: "midday env check",
      },
    },
  };

  it("is recognized as an Environment Check timeline entry", () => {
    expect(isEnvironmentCheckTimelineEntry(entry)).toBe(true);
  });

  it("view model marks it not-live and not a sensor reading", () => {
    const vm = buildEnvironmentCheckTimelineViewModel(entry);
    expect(vm).not.toBeNull();
    expect(vm!.notLive).toBe(true);
    expect(vm!.isSensorReading).toBe(false);
    // Source label explicitly says not live telemetry.
    expect(vm!.sourceLabel.toLowerCase()).toContain("not live");
    // Provenance is the manual / Quick Log lineage, never "live".
    expect(vm!.provenanceCopy.toLowerCase()).toContain("manual");
    expect(vm!.provenanceCopy.toLowerCase()).toContain("never live");
  });

  it("never leaks raw_payload / secrets / private fields through the view model", () => {
    const hostile = {
      ...entry,
      details: {
        ...entry.details,
        raw_payload: { mac: "AA:BB:CC:DD:EE:FF", api_key: "sk_live_x" },
        environment_check: {
          ...entry.details.environment_check,
          // Adversarial: try to smuggle secrets through the envelope.
          api_key: "sk_live_z",
          bridge_token: "abc",
          mac: "11:22:33:44:55:66",
          jwt: "eyJabc.eyJdef.sig",
        },
      },
    };
    const vm = buildEnvironmentCheckTimelineViewModel(hostile);
    expect(vm).not.toBeNull();
    assertNoSecrets(vm);
  });

  it("drops entries with no parseable timestamp (never invents 'now')", () => {
    const broken = { ...entry, entry_at: "not-a-date", occurred_at: undefined };
    expect(buildEnvironmentCheckTimelineViewModel(broken)).toBeNull();
  });

  it("ignores entries that are not Environment Check (e.g. watering)", () => {
    const watering = { ...entry, event_type: "watering", details: { volume_ml: 200 } };
    expect(isEnvironmentCheckTimelineEntry(watering)).toBe(false);
    expect(buildEnvironmentCheckTimelineViewModel(watering)).toBeNull();
  });
});
