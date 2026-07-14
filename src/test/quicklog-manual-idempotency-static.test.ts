/**
 * Static contract: quicklog_save_manual server-side idempotency.
 *
 * Regression guard for the duplicate-diary defect (2026-07-09 V0-loop
 * audit): the manual Quick Log RPC did an unconditional INSERT INTO
 * grow_events with no quicklog_idempotency guard, so a retry after a
 * companion photo/video failure double-wrote the diary. These tests pin
 * the migration's guarantees and the client threading so neither side
 * silently regresses.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");

/** Latest migration (lexicographic = timestamp order) defining the RPC. */
function latestSaveManualMigration(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let latest: string | null = null;
  for (const f of files) {
    const text = readFileSync(resolve(MIGRATIONS_DIR, f), "utf8");
    if (/CREATE (OR REPLACE )?FUNCTION public\.quicklog_save_manual/.test(text)) {
      latest = f;
    }
  }
  if (!latest) throw new Error("no migration defines quicklog_save_manual");
  return readFileSync(resolve(MIGRATIONS_DIR, latest), "utf8");
}

describe("quicklog_save_manual idempotency contract (migration)", () => {
  const sql = latestSaveManualMigration();

  it("accepts an idempotency key parameter (nullable for legacy-bundle rollout)", () => {
    expect(sql).toMatch(/p_idempotency_key text DEFAULT NULL/);
  });

  it("enforces the shared 8..200 key-length rule", () => {
    expect(sql).toMatch(/length\(p_idempotency_key\) < 8 OR length\(p_idempotency_key\) > 200/);
    expect(sql).toMatch(/'invalid_idempotency_key'/);
  });

  it("reuses the original grow_event on a duplicate key instead of re-writing", () => {
    expect(sql).toMatch(/SELECT grow_event_id INTO v_existing\s+FROM public\.quicklog_idempotency/);
    expect(sql).toMatch(/'duplicate_reused'/);
    expect(sql).toMatch(/'reused', true/);
  });

  it("records the idempotency row atomically inside the save block", () => {
    expect(sql).toMatch(
      /INSERT INTO public\.quicklog_idempotency \(user_id, idempotency_key, grow_event_id\)/,
    );
  });

  it("keeps authenticated-only execute grants and refreshes PostgREST", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.quicklog_save_manual[\s\S]*?FROM PUBLIC/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.quicklog_save_manual[\s\S]*?TO authenticated/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.quicklog_save_manual[\s\S]*?TO anon/,
    );
    expect(sql).toMatch(/NOTIFY pgrst/);
  });

  it("drops the old signature exactly (no ambiguous overload pair)", () => {
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS public\.quicklog_save_manual\(\s*text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb\s*\)/,
    );
  });
});

describe("quicklog_save_manual idempotency contract (client threading)", () => {
  const SHEET = readFileSync(resolve(ROOT, "src/components/QuickLogV2Sheet.tsx"), "utf8");
  const PAYLOAD = readFileSync(resolve(ROOT, "src/lib/quickLogV2SavePayload.ts"), "utf8");

  it("payload builder requires and threads the key", () => {
    expect(PAYLOAD).toMatch(/p_idempotency_key: string/);
    expect(PAYLOAD).toMatch(/invalid_idempotency_key/);
  });

  it("sheet holds one key per logical submission and passes it to the builder", () => {
    expect(SHEET).toMatch(/saveIdempotencyKeyRef\s*=\s*useRef<string>\(newQuickLogSaveKey\(\)\)/);
    expect(SHEET).toMatch(/idempotencyKey: saveIdempotencyKeyRef\.current/);
  });

  it("sheet rotates the key only on submission completion, never mid-retry", () => {
    // Two rotation sites: full success block + "Log another".
    const rotations = SHEET.match(/saveIdempotencyKeyRef\.current = newQuickLogSaveKey\(\)/g) ?? [];
    expect(rotations).toHaveLength(2);
  });

  it("companion-media failure is partial success — the save flow no longer aborts", () => {
    // The old bug: photo/video failure returned early, hiding a committed
    // log row behind an error and inviting a duplicating retry.
    expect(SHEET).toMatch(/let mediaFailure: string \| null = null/);
    expect(SHEET).toMatch(/Log saved — attachment failed/);
  });
});
