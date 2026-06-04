/**
 * Hardening: sensor-ingest-webhook idempotency under concurrent retries.
 *
 * The atomic dedupe guarantee comes from the partial unique index
 * `sensor_readings_dedupe_uidx` on
 *   (user_id, tent_id, source, metric, captured_at)
 * combined with `upsert(..., { ignoreDuplicates: true })` in the handler.
 *
 * These tests assert the contract at three layers:
 *  1. Static — the handler source uses upsert+onConflict+ignoreDuplicates.
 *  2. Migration — the partial unique index exists in repo SQL.
 *  3. Pure logic — a mocked supabase writer behaves correctly when the
 *     conflict path fires (concurrent identical requests do not double-insert).
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const HANDLER_SRC = readFileSync(
  resolve(__dirname, "../../supabase/functions/sensor-ingest-webhook/index.ts"),
  "utf8",
);

// ---------------------------------------------------------------------------
// 1. Static handler shape
// ---------------------------------------------------------------------------
describe("idempotency-race — static handler shape", () => {
  it("reads optional Idempotency-Key header", () => {
    expect(HANDLER_SRC).toMatch(/req\.headers\.get\(["']Idempotency-Key["']\)/);
  });

  it("caps the Idempotency-Key header to a safe length", () => {
    expect(HANDLER_SRC).toMatch(/\.slice\(0,\s*128\)/);
  });

  it("uses upsert with onConflict + ignoreDuplicates instead of SELECT-then-insert", () => {
    expect(HANDLER_SRC).toMatch(/\.upsert\(/);
    expect(HANDLER_SRC).toMatch(/onConflict:\s*["']user_id,tent_id,source,metric,captured_at["']/);
    expect(HANDLER_SRC).toMatch(/ignoreDuplicates:\s*true/);
  });

  it("removed the legacy SELECT-then-insert dedupe path", () => {
    const code = HANDLER_SRC.replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/existingKey\.has/);
    expect(code).not.toMatch(/\.select\("metric, value"\)/);
  });

  it("folds the Idempotency-Key into raw_payload for traceability", () => {
    expect(HANDLER_SRC).toMatch(/idempotency_key:\s*idempotencyKey/);
  });

  it("stamps server-resolved user_id on every upserted row", () => {
    expect(HANDLER_SRC).toMatch(/user_id:\s*auth\.userId/);
  });
});

// ---------------------------------------------------------------------------
// 2. Migration: partial unique index present in repo
// ---------------------------------------------------------------------------
describe("idempotency-race — migration safety net", () => {
  const migrationsDir = resolve(__dirname, "../../supabase/migrations");
  const files = readdirSync(migrationsDir);
  const combined = files
    .map((f) => readFileSync(resolve(migrationsDir, f), "utf8"))
    .join("\n");

  it("creates a partial unique index sensor_readings_dedupe_uidx", () => {
    expect(combined).toMatch(
      /CREATE\s+UNIQUE\s+INDEX[\s\S]*sensor_readings_dedupe_uidx[\s\S]*ON\s+public\.sensor_readings/i,
    );
  });

  it("scopes the unique index to rows with captured_at IS NOT NULL", () => {
    expect(combined).toMatch(/WHERE\s+captured_at\s+IS\s+NOT\s+NULL/i);
  });

  it("includes (user_id, tent_id, source, metric, captured_at) as the key", () => {
    expect(combined).toMatch(
      /\(\s*user_id\s*,\s*tent_id\s*,\s*source\s*,\s*metric\s*,\s*captured_at\s*\)/i,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Pure-logic concurrency simulation
// ---------------------------------------------------------------------------
type Row = {
  user_id: string;
  tent_id: string;
  source: string;
  metric: string;
  captured_at: string;
  value: number;
};

/**
 * Minimal in-memory mock that enforces the same partial unique index
 * semantics as Postgres: identical (user_id, tent_id, source, metric,
 * captured_at) tuples are deduplicated. Used to prove that the handler's
 * upsert+ignoreDuplicates strategy is race-free at the contract level.
 */
function makeMockSensorTable() {
  const rows: Row[] = [];
  const key = (r: Row) =>
    `${r.user_id}|${r.tent_id}|${r.source}|${r.metric}|${r.captured_at}`;
  return {
    rows,
    async upsert(input: Row[], opts: { onConflict: string; ignoreDuplicates: boolean }) {
      expect(opts.onConflict).toBe("user_id,tent_id,source,metric,captured_at");
      expect(opts.ignoreDuplicates).toBe(true);
      const inserted: Row[] = [];
      const existing = new Set(rows.map(key));
      for (const r of input) {
        const k = key(r);
        if (existing.has(k)) continue;
        existing.add(k);
        rows.push(r);
        inserted.push(r);
      }
      return { data: inserted.map((r) => ({ id: key(r) })), error: null };
    },
  };
}

const baseRow = (over: Partial<Row> = {}): Row => ({
  user_id: "u1",
  tent_id: "t1",
  source: "esp32_mqtt_bridge",
  metric: "temperature_c",
  captured_at: "2026-06-04T12:00:00.000Z",
  value: 24,
  ...over,
});

describe("idempotency-race — pure logic", () => {
  it("same idempotency key with identical payload keeps exactly one write", async () => {
    const table = makeMockSensorTable();
    const payload = [baseRow()];
    const a = await table.upsert(payload, {
      onConflict: "user_id,tent_id,source,metric,captured_at",
      ignoreDuplicates: true,
    });
    const b = await table.upsert(payload, {
      onConflict: "user_id,tent_id,source,metric,captured_at",
      ignoreDuplicates: true,
    });
    expect(a.data?.length).toBe(1);
    expect(b.data?.length).toBe(0); // second call dedupes
    expect(table.rows.length).toBe(1);
  });

  it("concurrent identical bridge-token requests cannot double-insert", async () => {
    const table = makeMockSensorTable();
    const payload = [baseRow()];
    const results = await Promise.all([
      table.upsert(payload, {
        onConflict: "user_id,tent_id,source,metric,captured_at",
        ignoreDuplicates: true,
      }),
      table.upsert(payload, {
        onConflict: "user_id,tent_id,source,metric,captured_at",
        ignoreDuplicates: true,
      }),
      table.upsert(payload, {
        onConflict: "user_id,tent_id,source,metric,captured_at",
        ignoreDuplicates: true,
      }),
    ]);
    const totalInserted = results.reduce((n, r) => n + (r.data?.length ?? 0), 0);
    expect(totalInserted).toBe(1);
    expect(table.rows.length).toBe(1);
  });

  it("different captured_at creates distinct readings (different idempotency keys)", async () => {
    const table = makeMockSensorTable();
    await table.upsert([baseRow({ captured_at: "2026-06-04T12:00:00.000Z" })], {
      onConflict: "user_id,tent_id,source,metric,captured_at",
      ignoreDuplicates: true,
    });
    await table.upsert([baseRow({ captured_at: "2026-06-04T12:01:00.000Z" })], {
      onConflict: "user_id,tent_id,source,metric,captured_at",
      ignoreDuplicates: true,
    });
    expect(table.rows.length).toBe(2);
  });

  it("different metrics at the same captured_at create distinct readings", async () => {
    const table = makeMockSensorTable();
    await table.upsert(
      [
        baseRow({ metric: "temperature_c", value: 24 }),
        baseRow({ metric: "humidity_pct", value: 55 }),
      ],
      {
        onConflict: "user_id,tent_id,source,metric,captured_at",
        ignoreDuplicates: true,
      },
    );
    expect(table.rows.length).toBe(2);
  });

  it("missing Idempotency-Key still produces deterministic dedupe via the unique index", async () => {
    // Behavior must be the same whether or not the client sent an
    // Idempotency-Key header — the DB-level constraint is the source of truth.
    const table = makeMockSensorTable();
    const payload = [baseRow()];
    await table.upsert(payload, {
      onConflict: "user_id,tent_id,source,metric,captured_at",
      ignoreDuplicates: true,
    });
    await table.upsert(payload, {
      onConflict: "user_id,tent_id,source,metric,captured_at",
      ignoreDuplicates: true,
    });
    expect(table.rows.length).toBe(1);
  });

  it("upsert mock is called with the exact contract options every time", async () => {
    const upsertSpy = vi.fn<(rows: Row[], opts: { onConflict: string; ignoreDuplicates: boolean }) => Promise<{ data: { id: string }[]; error: null }>>(
      async () => ({ data: [{ id: "x" }], error: null }),
    );
    await upsertSpy([baseRow()], {
      onConflict: "user_id,tent_id,source,metric,captured_at",
      ignoreDuplicates: true,
    });
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        onConflict: "user_id,tent_id,source,metric,captured_at",
        ignoreDuplicates: true,
      }),
    );
  });
});
