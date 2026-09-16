/**
 * Pure contract tests for e2e-local/lib/nativeLocalFixtures.ts.
 *
 * The native browser lane depends on these helpers to enforce the disposable
 * loopback boundary, validate confirmed Note receipts, and fingerprint owner
 * rows for cross-owner isolation. Failures here would weaken acceptance proof
 * without requiring a full Supabase + Playwright run to notice.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acceptedReceipt,
  fingerprint,
  isRow,
  localEnvironment,
  type OwnerRows,
} from "../../e2e-local/lib/nativeLocalFixtures";

const ENV_KEYS = [
  "NATIVE_LOCAL_BROWSER",
  "NATIVE_LOCAL_UI_URL",
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NATIVE_LOCAL_FIXTURE_PASSWORD",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;

const VALID = {
  NATIVE_LOCAL_BROWSER: "1",
  NATIVE_LOCAL_UI_URL: "http://127.0.0.1:5173",
  SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key-with-enough-length-for-local",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-distinct-from-anon",
  NATIVE_LOCAL_FIXTURE_PASSWORD: "Native-local-fixture-password-24chars!",
  VITE_SUPABASE_PUBLISHABLE_KEY: "anon-key-with-enough-length-for-local",
} as const;

let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function applyValidEnv(): void {
  for (const [key, value] of Object.entries(VALID)) {
    process.env[key] = value;
  }
}

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key]!;
  }
});

describe("localEnvironment", () => {
  it("accepts the exact isolated loopback mapping", () => {
    applyValidEnv();
    expect(localEnvironment()).toEqual({
      ui: "http://127.0.0.1:5173",
      api: "http://127.0.0.1:54321",
      anon: VALID.SUPABASE_ANON_KEY,
      service: VALID.SUPABASE_SERVICE_ROLE_KEY,
    });
  });

  it.each([
    ["NATIVE_LOCAL_BROWSER", "0"],
    ["NATIVE_LOCAL_UI_URL", "http://127.0.0.1:8080"],
    ["SUPABASE_URL", "https://example.supabase.co"],
    ["VITE_SUPABASE_URL", "http://127.0.0.1:9999"],
    ["SUPABASE_ANON_KEY", ""],
    ["SUPABASE_SERVICE_ROLE_KEY", ""],
    ["NATIVE_LOCAL_FIXTURE_PASSWORD", "too-short"],
    ["VITE_SUPABASE_PUBLISHABLE_KEY", "wrong-anon-mapping"],
  ] as const)("rejects when %s is wrong", (key, value) => {
    applyValidEnv();
    process.env[key] = value;
    expect(() => localEnvironment()).toThrow(/exact isolated UI\/API/);
  });

  it("rejects when anon and service keys are identical", () => {
    applyValidEnv();
    process.env.SUPABASE_SERVICE_ROLE_KEY = VALID.SUPABASE_ANON_KEY;
    expect(() => localEnvironment()).toThrow(/exact isolated UI\/API/);
  });
});

describe("isRow", () => {
  it("accepts plain objects and rejects null, arrays, and primitives", () => {
    expect(isRow({ ok: true })).toBe(true);
    expect(isRow(null)).toBe(false);
    expect(isRow([])).toBe(false);
    expect(isRow("note")).toBe(false);
    expect(isRow(undefined)).toBe(false);
  });
});

describe("acceptedReceipt", () => {
  const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("returns a confirmed grow_event_id receipt", () => {
    expect(acceptedReceipt({ ok: true, grow_event_id: uuid })).toEqual({
      ok: true,
      grow_event_id: uuid,
    });
  });

  it.each([
    ["non-object", "string"],
    ["ok false", { ok: false, grow_event_id: uuid }],
    ["missing id", { ok: true }],
    ["non-uuid id", { ok: true, grow_event_id: "not-a-uuid" }],
    ["numeric id", { ok: true, grow_event_id: 12345 }],
  ] as const)("rejects %s", (_label, value) => {
    expect(() => acceptedReceipt(value)).toThrow(/confirmed UUID receipt/);
  });
});

describe("fingerprint", () => {
  const ownerRowsSample = (): OwnerRows => ({
    grow_events: [
      { id: "b", user_id: "u1" },
      { id: "a", user_id: "u1" },
    ],
    diary_entries: [{ id: "d1", note: "same" }],
    environment_events: [],
    sensor_readings: [{ id: "s1", metric: "temperature_c" }],
  });

  it("is stable for identical row snapshots", () => {
    const rows = ownerRowsSample();
    expect(fingerprint(rows)).toBe(fingerprint(rows));
  });

  it("sorts rows within each table so order does not change the fingerprint", () => {
    const forward = ownerRowsSample();
    const reversed: OwnerRows = {
      ...forward,
      grow_events: [...forward.grow_events].reverse(),
    };
    expect(fingerprint(reversed)).toBe(fingerprint(forward));
  });

  it("changes when any watched table changes", () => {
    const base = fingerprint(ownerRowsSample());
    const mutated = fingerprint({
      ...ownerRowsSample(),
      sensor_readings: [{ id: "s2", metric: "humidity_pct" }],
    });
    expect(mutated).not.toBe(base);
  });
});
