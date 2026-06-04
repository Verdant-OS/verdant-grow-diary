/**
 * Pure rule tests for the Ingest Inspector helpers.
 */
import { describe, it, expect } from "vitest";
import {
  REDACTED_PLACEHOLDER,
  extractVendorLineage,
  filterInspectorReadings,
  inspectorSourceLabel,
  isLiveSource,
  redactRawPayload,
  type InspectorReadingLike,
} from "@/lib/ingestInspectorRules";

const makeReading = (
  over: Partial<InspectorReadingLike> = {},
): InspectorReadingLike => ({
  id: over.id ?? "r1",
  ts: over.ts ?? "2026-06-01T10:00:00Z",
  captured_at: over.captured_at ?? "2026-06-01T10:00:00Z",
  source: over.source ?? "webhook",
  metric: over.metric ?? "temperature_c",
  value: over.value ?? 24.1,
  quality: over.quality ?? "ok",
  tent_id: over.tent_id ?? "tent-a",
  device_id: over.device_id ?? null,
  raw_payload: over.raw_payload ?? null,
});

describe("inspectorSourceLabel / isLiveSource", () => {
  it("never labels csv/webhook/mqtt/ecowitt as Live", () => {
    for (const s of ["csv", "webhook", "mqtt", "ecowitt"]) {
      expect(inspectorSourceLabel(s).toLowerCase()).not.toBe("live");
      expect(isLiveSource(s)).toBe(false);
    }
  });
  it("returns Unknown for missing source", () => {
    expect(inspectorSourceLabel(null)).toBe("Unknown");
    expect(inspectorSourceLabel("")).toBe("Unknown");
  });
  it("provides friendly labels", () => {
    expect(inspectorSourceLabel("ecowitt")).toBe("EcoWitt");
    expect(inspectorSourceLabel("mqtt")).toBe("MQTT");
    expect(inspectorSourceLabel("home_assistant_bridge")).toBe("Home Assistant");
  });
});

describe("redactRawPayload", () => {
  it("redacts secret-like keys at any depth", () => {
    const result = redactRawPayload({
      token: "abc",
      Authorization: "Bearer x",
      apiKey: "k",
      nested: { password: "p", signature: "sig", safe: 1 },
      arr: [{ secret: "s" }, { ok: true }],
    }) as Record<string, unknown>;
    expect(result.token).toBe(REDACTED_PLACEHOLDER);
    expect(result.Authorization).toBe(REDACTED_PLACEHOLDER);
    expect(result.apiKey).toBe(REDACTED_PLACEHOLDER);
    const nested = result.nested as Record<string, unknown>;
    expect(nested.password).toBe(REDACTED_PLACEHOLDER);
    expect(nested.signature).toBe(REDACTED_PLACEHOLDER);
    expect(nested.safe).toBe(1);
    const arr = result.arr as Array<Record<string, unknown>>;
    expect(arr[0].secret).toBe(REDACTED_PLACEHOLDER);
    expect(arr[1].ok).toBe(true);
  });
  it("strips user_id from output", () => {
    const out = redactRawPayload({ user_id: "u-1", value: 2 }) as Record<
      string,
      unknown
    >;
    expect(out.user_id).toBe(REDACTED_PLACEHOLDER);
  });
  it("does not mutate input", () => {
    const input = { token: "x", nested: { secret: "s" } };
    redactRawPayload(input);
    expect(input.token).toBe("x");
    expect(input.nested.secret).toBe("s");
  });
});

describe("extractVendorLineage", () => {
  it("reads top-level vendor", () => {
    expect(extractVendorLineage({ vendor: "EcoWitt" })).toBe("EcoWitt");
  });
  it("reads metadata.vendor", () => {
    expect(
      extractVendorLineage({ metadata: { vendor: "Home Assistant" } }),
    ).toBe("Home Assistant");
  });
  it("returns null for missing / blank", () => {
    expect(extractVendorLineage(null)).toBeNull();
    expect(extractVendorLineage({ vendor: "  " })).toBeNull();
    expect(extractVendorLineage([])).toBeNull();
  });
});

describe("filterInspectorReadings", () => {
  const rows: InspectorReadingLike[] = [
    makeReading({ id: "a", source: "webhook", tent_id: "t1" }),
    makeReading({
      id: "b",
      source: "ecowitt",
      tent_id: "t2",
      raw_payload: { vendor: "EcoWitt" },
    }),
    makeReading({ id: "c", source: "mqtt", tent_id: "t1" }),
  ];
  it("filters by source", () => {
    const out = filterInspectorReadings(rows, { source: "mqtt" });
    expect(out.map((r) => r.id)).toEqual(["c"]);
  });
  it("filters by vendor (case-insensitive)", () => {
    const out = filterInspectorReadings(rows, { vendor: "ecowitt" });
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });
  it("filters by tentId", () => {
    const out = filterInspectorReadings(rows, { tentId: "t1" });
    expect(out.map((r) => r.id)).toEqual(["a", "c"]);
  });
  it("no filters returns all", () => {
    expect(filterInspectorReadings(rows, {}).length).toBe(3);
  });
});
