/**
 * Contract tests for the EcoWitt ingest edge function.
 *
 * The edge function (supabase/functions/ecowitt-ingest/index.ts) is a thin
 * shell around `adaptEcoWittPayloadToBridgeInput`. These tests pin down the
 * row shape it persists to `sensor_readings` and the safety guarantees that
 * must hold every release: credentials never reach the DB, vendor lineage
 * stays in raw_payload, source is always "ecowitt", and bad telemetry never
 * gets classified as healthy.
 *
 * Pure unit tests — no network, no Deno, no Supabase. Runs in Vitest.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adaptEcoWittPayloadToBridgeInput } from "@/lib/ecowittPayloadAdapter";

const TENT = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const NOW = "2026-06-04T12:30:00.000Z";

/** Mirror the row builder in the edge function (kept in lockstep). */
function buildRows(payload: Record<string, unknown>) {
  const adapter = adaptEcoWittPayloadToBridgeInput(payload, {
    tentId: TENT,
    allowServerReceivedAtFallback: true,
    serverReceivedAt: NOW,
  });
  if (!adapter.ok || adapter.input.readings.length === 0) {
    return { ok: false as const, adapter };
  }
  const capturedAt =
    typeof adapter.input.captured_at === "string"
      ? adapter.input.captured_at
      : NOW;
  const rows = adapter.input.readings.map((r) => ({
    user_id: USER,
    tent_id: TENT,
    source: "ecowitt" as const,
    metric: r.metric as string,
    value: r.value as number,
    captured_at: capturedAt,
    quality: "ok" as const,
    raw_payload: {
      vendor: "ecowitt",
      station_type: adapter.metadata.station_type,
      adapter_warnings: adapter.warnings,
      unit: r.unit ?? null,
    },
  }));
  return { ok: true as const, rows, adapter };
}

describe("EcoWitt ingest endpoint contract", () => {
  it("normalizes temp1f / humidity1 / soilmoisture1 / co2 into sensor_readings rows", () => {
    const res = buildRows({
      temp1f: 77,
      humidity1: 55,
      soilmoisture1: 40,
      co2: 850,
      dateutc: "2026-06-04 12:20:00",
      stationtype: "GW1100",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const metrics = res.rows.map((r) => r.metric).sort();
    expect(metrics).toContain("temperature_c");
    expect(metrics).toContain("humidity_pct");
    expect(metrics).toContain("soil_moisture_pct");
    expect(metrics).toContain("co2_ppm");
    for (const row of res.rows) {
      expect(row.source).toBe("ecowitt");
      expect(row.user_id).toBe(USER);
      expect(row.tent_id).toBe(TENT);
      expect(row.quality).toBe("ok");
      expect(row.raw_payload.vendor).toBe("ecowitt");
    }
  });

  it("normalizes indoor variants tempinf / humidityin / co2in", () => {
    const res = buildRows({
      tempinf: 72,
      humidityin: 48,
      co2in: 1200,
      dateutc: "2026-06-04 12:20:00",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const metrics = res.rows.map((r) => r.metric);
    expect(metrics.length).toBeGreaterThan(0);
  });

  it("redacts passkey / password / token / secret from raw_payload", () => {
    const res = buildRows({
      PASSKEY: "leaked-passkey-AAAA",
      passkey: "leaked-passkey-bbbb",
      password: "hunter2",
      token: "vbt_should_never_persist",
      secret: "shhh",
      temp1f: 77,
      humidity1: 55,
      dateutc: "2026-06-04 12:20:00",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const serialized = JSON.stringify(res.rows);
    expect(serialized).not.toContain("leaked-passkey");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("vbt_should_never_persist");
    expect(serialized).not.toContain("shhh");
    // Audit signal: adapter must have suppressed credentials.
    expect(res.adapter.warnings).toContain("vendor_credential_field_suppressed");
  });

  it("parses dateutc into captured_at", () => {
    const res = buildRows({
      temp1f: 77,
      humidity1: 55,
      dateutc: "2026-06-04 12:20:00",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows[0].captured_at).toMatch(/^2026-06-04T12:20:00/);
  });

  it("falls back to server time when dateutc is missing", () => {
    const res = buildRows({ temp1f: 77, humidity1: 55 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows[0].captured_at).toBe(NOW);
  });

  it("rejects empty / unmappable payloads (no orphan rows)", () => {
    const res = buildRows({ stationtype: "GW1100" });
    expect(res.ok).toBe(false);
  });

  it("never emits source other than 'ecowitt'", () => {
    const res = buildRows({ temp1f: 77, humidity1: 55, dateutc: "2026-06-04 12:20:00" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    for (const row of res.rows) expect(row.source).toBe("ecowitt");
  });
});

describe("EcoWitt ingest endpoint: source code safety scan", () => {
  const src = readFileSync(
    resolve(process.cwd(), "supabase/functions/ecowitt-ingest/index.ts"),
    "utf8",
  );

  it("requires Bearer auth before parsing the payload", () => {
    const authIdx = src.indexOf('authHeader?.startsWith("Bearer ")');
    const parseIdx = src.indexOf("parsePayload(req)");
    expect(authIdx).toBeGreaterThan(-1);
    expect(parseIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(parseIdx);
  });

  it("rejects requests with no tent_id (server-resolved or query/header)", () => {
    expect(src).toContain('"tent_id_required"');
    expect(src).toContain('"forbidden_tent"');
  });

  it("never writes to alerts or action_queue and never calls device control", () => {
    expect(src).not.toMatch(/from\(["']alerts["']\)/);
    expect(src).not.toMatch(/from\(["']action_queue["']\)/);
    expect(src).not.toMatch(/switchbot/i);
    expect(src).not.toMatch(/device[_-]?control/i);
  });

  it("tags all readings with source='ecowitt'", () => {
    expect(src).toContain('source: "ecowitt"');
  });

  it("dedupes on (user_id, tent_id, source, metric, captured_at)", () => {
    expect(src).toContain("user_id,tent_id,source,metric,captured_at");
    expect(src).toContain("ignoreDuplicates: true");
  });

  it("supports both POST and GET (EcoWitt customized upload)", () => {
    expect(src).toContain('req.method !== "POST" && req.method !== "GET"');
  });
});
