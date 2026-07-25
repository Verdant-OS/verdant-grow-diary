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

const MANUAL_TYPE_SIGNATURE = [
  "text",
  "uuid",
  "text",
  "numeric",
  "text",
  "numeric",
  "numeric",
  "numeric",
  "timestamptz",
  "jsonb",
  "text",
  "text",
].join("\\s*,\\s*");
const MANUAL_NAMED_SIGNATURE = [
  ["p_target_type", "text"],
  ["p_target_id", "uuid"],
  ["p_action", "text"],
  ["p_volume_ml", "numeric"],
  ["p_note", "text"],
  ["p_temperature_c", "numeric"],
  ["p_humidity_pct", "numeric"],
  ["p_vpd_kpa", "numeric"],
  ["p_occurred_at", "(?:timestamptz|timestamp\\s+with\\s+time\\s+zone)"],
  ["p_details", "jsonb"],
  ["p_idempotency_key", "text"],
  ["p_stage", "text"],
]
  .map(([name, type]) => `${name}\\s+${type}(?:\\s+DEFAULT\\s+[^,)]*)?`)
  .join("\\s*,\\s*");

const manualDefinitionPattern = () =>
  new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.quicklog_save_manual\\s*\\(\\s*${MANUAL_NAMED_SIGNATURE}\\s*\\)\\s*RETURNS\\s+jsonb[\\s\\S]*?AS\\s+(\\$function\\$|\\$\\$)([\\s\\S]*?)\\1`,
    "i",
  );
const manualDelegateRenamePattern = () =>
  new RegExp(
    `ALTER\\s+FUNCTION\\s+public\\.quicklog_save_manual\\s*\\(\\s*${MANUAL_TYPE_SIGNATURE}\\s*\\)\\s+RENAME\\s+TO\\s+quicklog_save_manual_pre_logged_at`,
    "i",
  );

/** Resolve the exact implementation and public wrapper for the 12-arg RPC. */
function delegatedSaveManualContract(): {
  delegateSql: string;
  delegateBody: string;
  wrapperSql: string;
} {
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"),
    }));
  let wrapperIndex = -1;
  for (let index = migrations.length - 1; index >= 0; index -= 1) {
    const { sql } = migrations[index];
    if (manualDelegateRenamePattern().test(sql) && manualDefinitionPattern().test(sql)) {
      wrapperIndex = index;
      break;
    }
  }
  if (wrapperIndex < 1) {
    throw new Error("no exact quicklog_save_manual delegate transition");
  }

  for (let index = wrapperIndex - 1; index >= 0; index -= 1) {
    const match = migrations[index].sql.match(manualDefinitionPattern());
    if (match?.[2]) {
      return {
        delegateSql: migrations[index].sql,
        delegateBody: match[2],
        wrapperSql: migrations[wrapperIndex].sql,
      };
    }
  }
  throw new Error("no exact quicklog_save_manual delegate implementation");
}

describe("quicklog_save_manual idempotency contract (migration)", () => {
  const { delegateSql, delegateBody, wrapperSql } = delegatedSaveManualContract();

  it("accepts an idempotency key parameter (nullable for legacy-bundle rollout)", () => {
    expect(delegateSql).toMatch(/p_idempotency_key text DEFAULT NULL/);
  });

  it("enforces the shared 8..200 key-length rule", () => {
    expect(delegateBody).toMatch(
      /length\(p_idempotency_key\) < 8 OR length\(p_idempotency_key\) > 200/,
    );
    expect(delegateBody).toMatch(/'invalid_idempotency_key'/);
  });

  it("reuses the original grow_event on a duplicate key instead of re-writing", () => {
    expect(delegateBody).toMatch(
      /SELECT grow_event_id INTO v_existing\s+FROM public\.quicklog_idempotency/,
    );
    expect(delegateBody).toMatch(/'duplicate_reused'/);
    expect(delegateBody).toMatch(/'reused', true/);
  });

  it("records the idempotency row atomically inside the save block", () => {
    expect(delegateBody).toMatch(
      /INSERT INTO public\.quicklog_idempotency \(user_id, idempotency_key, grow_event_id\)/,
    );
  });

  it("keeps authenticated-only execute grants and refreshes PostgREST", () => {
    expect(wrapperSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.quicklog_save_manual[\s\S]*?FROM PUBLIC/,
    );
    expect(wrapperSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.quicklog_save_manual[\s\S]*?TO authenticated/,
    );
    expect(wrapperSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.quicklog_save_manual[\s\S]*?TO anon/,
    );
    expect(wrapperSql).toMatch(/NOTIFY pgrst/);
  });

  it("transitions the exact signature without an ambiguous overload pair", () => {
    expect(wrapperSql).toMatch(manualDelegateRenamePattern());
    expect(wrapperSql).toMatch(manualDefinitionPattern());
    expect(wrapperSql).toMatch(
      new RegExp(
        `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.quicklog_save_manual_pre_logged_at\\s*\\(\\s*${MANUAL_TYPE_SIGNATURE}\\s*\\)\\s+FROM\\s+authenticated`,
        "i",
      ),
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

  it("sheet rotates the shared key only on completed logical submissions", () => {
    // Three intentional sites: structured-feed success, manual-log success,
    // and the grower's explicit "Log another" reset.
    const rotations = SHEET.match(/saveIdempotencyKeyRef\.current = newQuickLogSaveKey\(\)/g) ?? [];
    expect(rotations).toHaveLength(3);
    expect(SHEET).toMatch(
      /trackQuickLogSuccess\("feed", \{ reused: result\.reused \}\);[\s\S]{0,300}saveIdempotencyKeyRef\.current = newQuickLogSaveKey\(\)/,
    );
  });

  it("companion-media failure is partial success — the save flow no longer aborts", () => {
    // The old bug: photo/video failure returned early, hiding a committed
    // log row behind an error and inviting a duplicating retry.
    expect(SHEET).toMatch(/let mediaFailure: string \| null = null/);
    expect(SHEET).toMatch(/Log saved — attachment failed/);
  });
});
