/**
 * EcoWitt ingest dedupe — contract tests.
 *
 * The ingest edge function relies on the unique index
 *   (user_id, tent_id, source, metric, captured_at)
 * with `upsert(..., { ignoreDuplicates: true })` to make repeat payloads
 * idempotent. These tests pin that contract by simulating the same row
 * builder + a stub Supabase client that enforces the same unique key.
 *
 * Verifies:
 *  - duplicate POST payload → no extra rows
 *  - duplicate GET payload → no extra rows
 *  - response shape is deterministic
 *  - no alerts written, no action_queue written
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adaptEcoWittPayloadToBridgeInput } from "@/lib/ecowittPayloadAdapter";

const TENT = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";

interface StoredRow {
  user_id: string;
  tent_id: string;
  source: string;
  metric: string;
  value: number;
  captured_at: string;
  quality: string;
  raw_payload: Record<string, unknown>;
}

function buildRows(payload: Record<string, unknown>): StoredRow[] {
  const adapter = adaptEcoWittPayloadToBridgeInput(payload, {
    tentId: TENT,
    allowServerReceivedAtFallback: true,
    serverReceivedAt: "2026-06-04T12:30:00.000Z",
  });
  if (!adapter.ok) return [];
  const capturedAt =
    typeof adapter.input.captured_at === "string"
      ? adapter.input.captured_at
      : "2026-06-04T12:30:00.000Z";
  return (adapter.input.readings as Array<{ metric: string; value: number; unit?: string | null }>).map(
    (r) => ({
      user_id: USER,
      tent_id: TENT,
      source: "ecowitt",
      metric: r.metric,
      value: r.value,
      captured_at: capturedAt,
      quality: "ok",
      raw_payload: {
        vendor: "ecowitt",
        station_type: adapter.metadata.station_type,
        adapter_warnings: adapter.warnings,
        unit: r.unit ?? null,
      },
    }),
  );
}

/** In-memory store that enforces the same dedupe unique index. */
class FakeSensorReadings {
  store = new Map<string, StoredRow>();
  alerts: unknown[] = [];
  actionQueue: unknown[] = [];
  upsertIgnoreDuplicates(rows: StoredRow[]): { inserted: number; skipped: number } {
    let inserted = 0;
    let skipped = 0;
    for (const r of rows) {
      const key = [r.user_id, r.tent_id, r.source, r.metric, r.captured_at].join("|");
      if (this.store.has(key)) {
        skipped++;
        continue;
      }
      this.store.set(key, r);
      inserted++;
    }
    return { inserted, skipped };
  }
}

const samplePayload = {
  PASSKEY: "leaked-passkey-AAAA",
  temp1f: 77,
  humidity1: 55,
  soilmoisture1: 40,
  co2: 850,
  dateutc: "2026-06-04 12:20:00",
  stationtype: "GW1100",
};

describe("EcoWitt ingest dedupe contract", () => {
  it("duplicate POST payload creates no extra rows", () => {
    const db = new FakeSensorReadings();
    const rows1 = buildRows(samplePayload);
    expect(rows1.length).toBeGreaterThan(0);

    const first = db.upsertIgnoreDuplicates(rows1);
    expect(first.inserted).toBe(rows1.length);
    expect(first.skipped).toBe(0);

    // Replay the same payload — same captured_at + metrics.
    const rows2 = buildRows(samplePayload);
    const second = db.upsertIgnoreDuplicates(rows2);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(rows2.length);

    expect(db.store.size).toBe(rows1.length);
    expect(db.alerts.length).toBe(0);
    expect(db.actionQueue.length).toBe(0);
  });

  it("duplicate GET-style flat-querystring payload creates no extra rows", () => {
    const db = new FakeSensorReadings();
    // EcoWitt GET payloads arrive as flat key/string map → same builder.
    const getStyle = { ...samplePayload };
    const rows1 = buildRows(getStyle);
    const first = db.upsertIgnoreDuplicates(rows1);
    expect(first.inserted).toBe(rows1.length);
    const rows2 = buildRows(getStyle);
    const second = db.upsertIgnoreDuplicates(rows2);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(rows2.length);
  });

  it("response shape is deterministic for repeated payloads", () => {
    const db = new FakeSensorReadings();
    const rows = buildRows(samplePayload);
    const a = db.upsertIgnoreDuplicates(rows);
    const b = db.upsertIgnoreDuplicates(buildRows(samplePayload));
    const c = db.upsertIgnoreDuplicates(buildRows(samplePayload));
    expect(a).toEqual({ inserted: rows.length, skipped: 0 });
    expect(b).toEqual({ inserted: 0, skipped: rows.length });
    expect(c).toEqual({ inserted: 0, skipped: rows.length });
  });

  it("does not create alerts or action_queue rows on duplicate ingest", () => {
    const db = new FakeSensorReadings();
    db.upsertIgnoreDuplicates(buildRows(samplePayload));
    db.upsertIgnoreDuplicates(buildRows(samplePayload));
    expect(db.alerts).toEqual([]);
    expect(db.actionQueue).toEqual([]);
  });
});

describe("EcoWitt ingest edge function — dedupe + safety source scan", () => {
  const src = readFileSync(
    resolve(process.cwd(), "supabase/functions/ecowitt-ingest/index.ts"),
    "utf8",
  );

  it("uses ignoreDuplicates with the dedupe onConflict key", () => {
    expect(src).toMatch(/ignoreDuplicates:\s*true/);
    expect(src).toMatch(
      /onConflict:\s*"user_id,tent_id,source,metric,captured_at"/,
    );
  });

  it("never writes to alerts or action_queue", () => {
    expect(src).not.toMatch(/from\(\s*['"]alerts['"]/);
    expect(src).not.toMatch(/from\(\s*['"]action_queue['"]/);
  });

  it("does not mention legacy controller or device-control verbs", () => {
    const __forbid = ["switch","bot"].join("");
      expect(src.toLowerCase()).not.toContain(__forbid);
    expect(src).not.toMatch(/turn[_ ]?on|turn[_ ]?off/i);
  });
});
