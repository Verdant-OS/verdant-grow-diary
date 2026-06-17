/**
 * Storage-mapping and insert-error classification for sensor-ingest-webhook.
 *
 * Pins the Verdant sensor-truth contract: transport/vendor source labels
 * ("ecowitt", "mqtt", "webhook") must collapse to a canonical stored
 * source ("live"), while the original transport label is preserved as
 * lineage metadata in `raw_payload` (never used for auth or routing).
 * Also pins the sanitized insert-error reason classifier — it must never
 * echo raw PG text, tokens, or constraint internals.
 */
import { describe, expect, it } from "vitest";
import {
  buildStoredRow,
  CANONICAL_STORED_SOURCES,
  classifyInsertError,
  mapStoredSourceForTransport,
} from "../../supabase/functions/sensor-ingest-webhook/storageMapping";

const TENT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

const baseRow = {
  tent_id: TENT,
  metric: "temperature_c",
  value: 26.9,
  captured_at: "2026-06-04T12:00:00.000Z",
  ts: "2026-06-04T12:00:00.000Z",
  quality: "ok",
  device_id: null,
  raw_payload: {
    tent_id: TENT,
    source: "ecowitt",
    captured_at: "2026-06-04T12:00:00.000Z",
    metrics: { temp_f: 80.42, humidity_percent: 41, soil_moisture_pct: 83 },
    metadata: { device_id: "GW2000A_V1.2.3" },
    vendor: "ecowitt",
  } as Record<string, unknown>,
} as Record<string, unknown>;

describe("mapStoredSourceForTransport", () => {
  it("collapses ecowitt transport to canonical live", () => {
    expect(mapStoredSourceForTransport("ecowitt")).toBe("live");
    expect(mapStoredSourceForTransport("ECOWITT")).toBe("live");
    expect(mapStoredSourceForTransport(" ecowitt ")).toBe("live");
  });

  it("collapses other transport labels to live", () => {
    expect(mapStoredSourceForTransport("mqtt")).toBe("live");
    expect(mapStoredSourceForTransport("webhook")).toBe("live");
    expect(mapStoredSourceForTransport("webhook_generic")).toBe("live");
    expect(mapStoredSourceForTransport("home_assistant_bridge")).toBe("live");
  });

  it("passes canonical sources through unchanged", () => {
    for (const s of CANONICAL_STORED_SOURCES) {
      expect(mapStoredSourceForTransport(s)).toBe(s);
    }
  });

  it("returns live for null / empty / non-string", () => {
    expect(mapStoredSourceForTransport(null)).toBe("live");
    expect(mapStoredSourceForTransport(undefined)).toBe("live");
    expect(mapStoredSourceForTransport("")).toBe("live");
  });
});

describe("buildStoredRow — EcoWitt transport mapping", () => {
  it("remaps source ecowitt -> live and preserves transport lineage", () => {
    const stored = buildStoredRow({
      row: { ...baseRow, source: "ecowitt" },
      userId: USER,
      idempotencyKey: "idem-abc-12345678",
    });
    expect(stored.source).toBe("live");
    // tent_id and metrics preserved verbatim
    expect(stored.tent_id).toBe(TENT);
    expect(stored.metric).toBe("temperature_c");
    expect(stored.value).toBe(26.9);
    // user_id comes from auth, never from body
    expect(stored.user_id).toBe(USER);
    // lineage in raw_payload
    expect(stored.raw_payload.metadata).toMatchObject({
      transport_source: "ecowitt",
      verdant_source: "live",
    });
    expect(stored.raw_payload.vendor).toBe("ecowitt");
    expect(stored.raw_payload.idempotency_key).toBe("idem-abc-12345678");
  });

  it("never sends source: 'ecowitt' to the DB insert", () => {
    const stored = buildStoredRow({
      row: { ...baseRow, source: "ecowitt" },
      userId: USER,
      idempotencyKey: null,
    });
    // The DB-bound source must be canonical.
    expect(stored.source).not.toBe("ecowitt");
    expect((CANONICAL_STORED_SOURCES as readonly string[])).toContain(
      stored.source,
    );
  });

  it("preserves canonical manual/csv/demo unchanged", () => {
    for (const s of ["manual", "csv", "demo", "stale", "invalid"] as const) {
      const stored = buildStoredRow({
        row: { ...baseRow, source: s },
        userId: USER,
        idempotencyKey: null,
      });
      expect(stored.source).toBe(s);
    }
  });

  it("does not overwrite an existing caller-supplied vendor", () => {
    const stored = buildStoredRow({
      row: {
        ...baseRow,
        source: "ecowitt",
        raw_payload: { ...baseRow.raw_payload, vendor: "ecowitt_gw2000a" },
      },
      userId: USER,
      idempotencyKey: null,
    });
    expect(stored.raw_payload.vendor).toBe("ecowitt_gw2000a");
    expect(stored.raw_payload.metadata).toMatchObject({
      transport_source: "ecowitt",
      verdant_source: "live",
    });
  });

  it("never leaks Authorization / bridge token shaped strings via metadata", () => {
    const stored = buildStoredRow({
      row: { ...baseRow, source: "ecowitt" },
      userId: USER,
      idempotencyKey: "idem",
    });
    const json = JSON.stringify(stored);
    expect(json).not.toMatch(/Authorization/i);
    expect(json).not.toMatch(/vbt_[A-Za-z0-9]{6,}/);
    expect(json).not.toMatch(/Bearer\s+\S+/i);
    expect(json).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe("classifyInsertError — sanitized reason codes", () => {
  it("23502 -> insert_required_field_missing", () => {
    expect(
      classifyInsertError({ code: "23502", message: 'null value in column "tent_id"' }),
    ).toBe("insert_required_field_missing");
  });

  it("23514 with source -> insert_source_constraint_failed", () => {
    expect(
      classifyInsertError({
        code: "23514",
        message: "new row violates check constraint sensor_readings_source_check",
      }),
    ).toBe("insert_source_constraint_failed");
  });

  it("23514 without source -> insert_check_failed", () => {
    expect(
      classifyInsertError({ code: "23514", message: "violates check constraint quality_ok" }),
    ).toBe("insert_check_failed");
  });

  it("42703 / 42P10 -> insert_column_mismatch", () => {
    expect(classifyInsertError({ code: "42703", message: 'column "foo" does not exist' }))
      .toBe("insert_column_mismatch");
    expect(
      classifyInsertError({
        code: "42P10",
        message: "no unique or exclusion constraint matching ON CONFLICT",
      }),
    ).toBe("insert_column_mismatch");
  });

  it("23505 -> insert_duplicate", () => {
    expect(classifyInsertError({ code: "23505", message: "duplicate key" })).toBe(
      "insert_duplicate",
    );
  });

  it("P0001 trigger raise mentioning source -> insert_source_constraint_failed", () => {
    expect(
      classifyInsertError({ code: "P0001", message: "invalid sensor source: ecowitt_x" }),
    ).toBe("insert_source_constraint_failed");
  });

  it("unknown / null -> insert_unknown", () => {
    expect(classifyInsertError(null)).toBe("insert_unknown");
    expect(classifyInsertError({})).toBe("insert_unknown");
    expect(classifyInsertError({ code: "XXNNN", message: "??" })).toBe(
      "insert_unknown",
    );
  });

  it("reason values are stable enum strings, never raw PG text", () => {
    const r = classifyInsertError({
      code: "23502",
      message: 'null value in column "tent_id" violates not-null constraint',
    });
    expect(typeof r).toBe("string");
    expect(r).not.toContain("tent_id");
    expect(r).not.toContain("null");
    expect(r).not.toContain("constraint");
  });
});
