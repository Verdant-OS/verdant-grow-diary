import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAiSensorSnapshotContext } from "@/lib/aiSensorSnapshotContextRules";
import {
  resolveQuickLogSensorSnapshotForAi,
  type QuickLogSensorAcquisitionRow,
} from "@/lib/quick-log/quickLogSensorSnapshotAcquisitionRules";

/**
 * Residual of #1003: the resolver feeds the ai-coach prompt, so every path
 * must build its output from an allowlist. Sensitive values are injected at
 * the top level and nested; none may survive into the returned object or its
 * JSON serialization.
 */

const TOKEN = "vbt_super_secret_bridge_token_0123456789";
const MAC = "AA:BB:CC:DD:EE:FF";
const UUID = "3f2c9a1e-7b4d-4e8a-9c61-2d5f0b8e7a13";
const RAW_MARKER = "raw_payload_marker_do_not_forward";

const SENSITIVE_STRINGS = [TOKEN, MAC, UUID, RAW_MARKER, "raw_payload", "vbt_"];

function sensitiveFields(): Record<string, unknown> {
  return {
    raw_payload: { marker: RAW_MARKER, token: TOKEN, mac: MAC, device_uuid: UUID },
    token: TOKEN,
    bridge_token: TOKEN,
    mac: MAC,
    passkey: MAC,
    hardware_id: UUID,
    device_id: UUID,
    station_uuid: UUID,
    nested: {
      raw_payload: { marker: RAW_MARKER },
      deeper: { token: TOKEN, mac: MAC, uuid: UUID },
    },
  };
}

function expectNoSensitiveData(resolved: unknown) {
  const json = JSON.stringify(resolved) ?? "";
  for (const needle of SENSITIVE_STRINGS) {
    expect(json).not.toContain(needle);
  }
  if (resolved && typeof resolved === "object") {
    const keys = Object.keys(resolved);
    for (const key of [
      "raw_payload",
      "token",
      "bridge_token",
      "mac",
      "passkey",
      "hardware_id",
      "device_id",
      "station_uuid",
      "nested",
      "metrics",
    ]) {
      expect(keys).not.toContain(key);
    }
    for (const value of Object.values(resolved)) {
      expect(value === null || typeof value === "string" || typeof value === "number").toBe(true);
    }
  }
}

function liveRow(
  metric: string,
  value: number,
  rawPayload: unknown = {
    vendor: "ecowitt",
    metadata: { reported_verdant_source: "live", raw_payload: { marker: RAW_MARKER } },
  },
): QuickLogSensorAcquisitionRow {
  return {
    id: UUID,
    metric,
    value,
    quality: "ok",
    source: "live",
    captured_at: "2026-06-09T12:00:00Z",
    raw_payload: rawPayload,
  };
}

describe("resolveQuickLogSensorSnapshotForAi — allowlisted output", () => {
  it("no-metrics flat snapshot: drops raw_payload, token, MAC and UUID at every depth", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi({
      source: "manual",
      captured_at: "2026-06-09T12:00:00Z",
      temperature_c: 24.5,
      humidity: 55,
      ...sensitiveFields(),
    });

    expectNoSensitiveData(resolved);
    expect(resolved).toEqual({
      source: "manual",
      captured_at: "2026-06-09T12:00:00.000Z",
      temperature_c: 24.5,
      humidity: 55,
    });
  });

  it("no-metrics flat snapshot: does not forward a numeric value under an unknown key", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi({
      source: "csv",
      captured_at: "2026-06-09T12:00:00Z",
      vpd_kpa: 1.1,
      serial_number: 123456789,
    }) as Record<string, unknown>;

    expect(resolved).toEqual({
      source: "csv",
      captured_at: "2026-06-09T12:00:00.000Z",
      vpd_kpa: 1.1,
    });
  });

  it("nested non-live snapshot: drops sensitive top-level and metric-level fields", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi({
      source: "manual",
      captured_at: "2026-06-09T12:00:00Z",
      metrics: {
        temperature: 23,
        humidity: 50,
        device_serial: 987654321,
        nested: { token: TOKEN, mac: MAC, uuid: UUID },
        raw_payload: { marker: RAW_MARKER },
      },
      ...sensitiveFields(),
    });

    expectNoSensitiveData(resolved);
    expect(resolved).toEqual({
      source: "manual",
      captured_at: "2026-06-09T12:00:00.000Z",
      temperature_c: 23,
      humidity: 50,
    });
  });

  it("nested live snapshot corroborated by rows: forwards only allowlisted values", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi(
      {
        source: "live",
        captured_at: "2026-06-09T12:00:00Z",
        metrics: { temperature: 99 },
        ...sensitiveFields(),
      },
      [liveRow("temperature_c", 24.3), liveRow("humidity_pct", 55)],
    );

    expectNoSensitiveData(resolved);
    expect(resolved).toEqual({
      source: "live",
      captured_at: "2026-06-09T12:00:00.000Z",
      temperature_c: 24.3,
      humidity: 55,
    });
  });

  it("nested live snapshot without provenance fails closed to invalid, not unknown", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi(
      {
        source: "live",
        captured_at: "2026-06-09T12:00:00Z",
        metrics: { temperature: 99 },
        ...sensitiveFields(),
      },
      null,
    );

    expectNoSensitiveData(resolved);
    expect(resolved).toEqual({ source: "invalid", captured_at: "2026-06-09T12:00:00.000Z" });

    const context = buildAiSensorSnapshotContext(resolved, {
      now: new Date("2026-06-09T12:05:00Z"),
    });
    expect(context.sourceLabel).toBe("invalid");
    expect(context.isTrustedForAi).toBe(false);
    expect(context.valuesForModel).toBeNull();
  });

  it("diagnostic snapshot: becomes demo and keeps nothing sensitive", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi({
      ...sensitiveFields(),
      source: "live",
      captured_at: "2026-06-09T12:00:00Z",
      temperature_c: 99,
      raw_payload: {
        vendor: "ecowitt_windows_testbench",
        metadata: { confidence: "test", token: TOKEN, mac: MAC, uuid: UUID, marker: RAW_MARKER },
      },
    });

    expectNoSensitiveData(resolved);
    expect(resolved).toEqual({ source: "demo", captured_at: "2026-06-09T12:00:00.000Z" });
  });

  it.each([
    ["missing", undefined],
    ["unlabeled", "unknown"],
    ["unrecognized", "gateway_v2"],
    ["token-shaped", TOKEN],
    ["non-string", 42],
  ])("%s source maps to invalid and is never echoed", (_label, source) => {
    const resolved = resolveQuickLogSensorSnapshotForAi({
      source,
      captured_at: "2026-06-09T12:00:00Z",
      temperature_c: 24,
      ...sensitiveFields(),
    }) as Record<string, unknown>;

    expectNoSensitiveData(resolved);
    expect(resolved.source).toBe("invalid");
  });

  it("canonicalizes legacy aliases and source spelling", () => {
    const imported = resolveQuickLogSensorSnapshotForAi({
      source: " Imported ",
      captured_at: "2026-06-09T12:00:00Z",
    }) as Record<string, unknown>;
    const fixture = resolveQuickLogSensorSnapshotForAi({
      data_source: "fixture",
      captured_at: "2026-06-09T12:00:00Z",
    }) as Record<string, unknown>;
    expect(imported.source).toBe("csv");
    expect(fixture.source).toBe("demo");
  });

  it("does not echo a token-shaped or non-date captured_at", () => {
    for (const capturedAt of [TOKEN, MAC, UUID, { raw_payload: RAW_MARKER }, ""]) {
      const resolved = resolveQuickLogSensorSnapshotForAi({
        source: "manual",
        captured_at: capturedAt,
        temperature_c: 24,
      }) as Record<string, unknown>;
      expectNoSensitiveData(resolved);
      expect(resolved.captured_at).toBeNull();
    }
  });

  it("non-object inputs never echo their content", () => {
    expect(resolveQuickLogSensorSnapshotForAi(null)).toBeNull();
    expect(resolveQuickLogSensorSnapshotForAi(undefined)).toBeNull();
    for (const input of [TOKEN, 42, [{ raw_payload: RAW_MARKER, token: TOKEN, mac: MAC }]]) {
      const resolved = resolveQuickLogSensorSnapshotForAi(input);
      expectNoSensitiveData(resolved);
      expect(resolved).toEqual({ source: "invalid", captured_at: null });
    }
  });

  it("is deterministic and does not mutate its input", () => {
    const input = {
      source: "manual",
      captured_at: "2026-06-09T12:00:00Z",
      metrics: { temperature: 23 },
      ...sensitiveFields(),
    };
    const before = JSON.stringify(input);
    const first = resolveQuickLogSensorSnapshotForAi(input);
    const second = resolveQuickLogSensorSnapshotForAi(input);
    expect(second).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
    expect(first).not.toBe(input);
  });
});

/** Quoted string keys inside the first `<marker> ... ]` block of a source file. */
function quotedKeysAfter(file: string, marker: string): string[] {
  const src = readFileSync(resolve(process.cwd(), file), "utf8");
  const start = src.indexOf(marker);
  expect(start, `${marker} not found in ${file}`).toBeGreaterThanOrEqual(0);
  const end = src.indexOf("]", start);
  const block = src.slice(start, end).replace(/\/\/.*$/gm, "");
  return [...block.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]).sort();
}

describe("AI reading-key allowlist stays in step with the annotator", () => {
  it("AI_READING_KEYS equals READING_KEYS in aiSensorSnapshotContextRules.ts", () => {
    const allowlist = quotedKeysAfter(
      "src/lib/quick-log/quickLogSensorSnapshotAcquisitionRules.ts",
      "const AI_READING_KEYS",
    );
    const annotator = quotedKeysAfter(
      "src/lib/aiSensorSnapshotContextRules.ts",
      "const READING_KEYS",
    );
    expect(allowlist.length).toBeGreaterThan(0);
    expect(allowlist).toEqual(annotator);
  });
});

describe("flat (no-metrics) live snapshot — current behavior, pinned", () => {
  it("keeps source=live without provenance rows (only nested snapshots require corroboration)", () => {
    const capturedAt = new Date().toISOString();
    const resolved = resolveQuickLogSensorSnapshotForAi({
      source: "live",
      captured_at: capturedAt,
      temperature_c: 24,
    });
    expect(resolved).toEqual({ source: "live", captured_at: capturedAt, temperature_c: 24 });
  });
});
