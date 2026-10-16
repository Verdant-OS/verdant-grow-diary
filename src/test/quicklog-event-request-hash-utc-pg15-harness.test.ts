// @source-scan-justified: pins the UTC repair's preflight/postcondition hashes and its line-level diff against the predecessor wrapper as text; runtime hashing, reuse and TimeZone restoration are proven by scripts/run-quicklog-event-request-hash-utc-pg15-harness.mjs.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  UTC_HASH_MIGRATION,
  UTC_HASH_WRAPPER_MD5,
  pinnedUtcHashSql,
  runEventRequestHashUtcHarness,
} from "../../scripts/run-quicklog-event-request-hash-utc-pg15-harness.mjs";

const root = resolve(__dirname, "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const read = (name: string) =>
  readFileSync(resolve(migrationsDir, name), "utf8").replace(/\r/g, "");
const PREDECESSOR = "20261001140000_quicklog_event_replay_mirrorless_legacy.sql";
const localUrl =
  "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_quicklog_delegate_repair";

function body(sql: string, marker: string): string {
  const start = sql.indexOf(marker);
  const open = sql.indexOf("AS $function$", start);
  const close = sql.indexOf("$function$;", open + 13);
  if (start < 0 || open < 0 || close < 0) throw new Error(`missing ${marker}`);
  return sql.slice(open + 13, close);
}
const md5 = (text: string) => createHash("md5").update(text).digest("hex");
const WRAPPER = "CREATE OR REPLACE FUNCTION public.quicklog_save_event(";

describe("Quick Log event request hash UTC PostgreSQL 15 proof", () => {
  it.each([
    null,
    "postgresql://postgres:secret@db.example.test:5432/verdant_quicklog_delegate_repair",
    "postgresql://postgres:secret@127.0.0.1:5432/postgres",
    "postgresql://service_role:secret@127.0.0.1:5432/verdant_quicklog_delegate_repair",
    "postgresql://postgres:secret@127.0.0.1:6543/verdant_quicklog_delegate_repair",
  ])("rejects unapproved database %s before starting a process", async (url) => {
    let calls = 0;
    const spawnImpl = () => {
      calls++;
      throw new Error("must not spawn");
    };
    await expect(runEventRequestHashUtcHarness({ url, spawnImpl })).resolves.toBe(1);
    expect(calls).toBe(0);
  });

  it("does not reset a database without the disposable sentinel", async () => {
    const inputs: string[] = [];
    await expect(
      runEventRequestHashUtcHarness({
        url: localUrl,
        spawnImpl: (_command: string, _args: string[], options: { input?: string }) => {
          inputs.push(String(options.input ?? ""));
          return { status: 0, stdout: "rejected\n", stderr: "" };
        },
      }),
    ).resolves.toBe(1);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).not.toContain("drop schema");
  });

  it("refuses altered repair bytes", () => {
    const repair = pinnedUtcHashSql();
    expect(() => pinnedUtcHashSql(repair.replace("ELSE 'UTC'", "ELSE v_caller_time_zone"))).toThrow(
      "utc_hash_migration_fingerprint_mismatch",
    );
  });

  it("is versioned after its predecessor and every merged migration", () => {
    const version = UTC_HASH_MIGRATION.slice(0, 14);
    const others = readdirSync(migrationsDir).filter(
      (name) => name.endsWith(".sql") && name !== UTC_HASH_MIGRATION,
    );
    expect(others).toContain(PREDECESSOR);
    expect(others.filter((name) => name.slice(0, 14) >= version)).toEqual([]);
  });

  it("pins the predecessor, delegate, helper and its own wrapper by the md5 PostgreSQL checks", () => {
    const repair = pinnedUtcHashSql();
    const foundation = read("20260725024026_quicklog_dual_timestamp_foundation.sql");
    const predecessorMd5 = md5(body(read(PREDECESSOR), WRAPPER));
    const delegateMd5 = md5(body(read("20260725023000_core_schema_forward_repair.sql"), WRAPPER));
    const helperMd5 = md5(
      body(foundation, "CREATE FUNCTION public.quicklog_event_request_hash_pre_logged_at("),
    );
    const ownMd5 = md5(body(repair, WRAPPER));
    expect(ownMd5).toBe(UTC_HASH_WRAPPER_MD5);
    const [preflight, rest] = repair.split(WRAPPER);
    expect(preflight.match(/'[0-9a-f]{32}'/g)).toEqual([
      `'${predecessorMd5}'`,
      `'${delegateMd5}'`,
      `'${helperMd5}'`,
    ]);
    expect(preflight).toContain("quicklog_event_request_hash_utc_preflight_unrecognized");
    expect(rest.slice(rest.lastIndexOf("$function$;"))).toContain(`= '${ownMd5}'`);
  });

  it("keeps the signature, owner settings and grants of the predecessor", () => {
    const repair = pinnedUtcHashSql();
    const predecessor = read(PREDECESSOR);
    const header = (sql: string) => sql.slice(sql.indexOf(WRAPPER), sql.indexOf("AS $function$"));
    const grants = (sql: string) => sql.slice(sql.indexOf("$function$;"), sql.indexOf("\nDO $"));
    expect(header(repair)).toBe(header(predecessor));
    expect(grants(repair)).toBe(grants(predecessor));
    expect(repair).not.toMatch(/SET\s+TimeZone/i);
  });

  it("changes only the hash bindings of the predecessor wrapper", () => {
    const before = body(read(PREDECESSOR), WRAPPER);
    const after = body(pinnedUtcHashSql(), WRAPPER);
    const strip = (text: string) =>
      text
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n");
    const added = strip(after)
      .split("\n")
      .filter((line) => !strip(before).split("\n").includes(line));
    // Every predecessor code line survives except the inline mirrorless helper
    // call (now the precomputed legacy hashes), the exact-legacy comparison and
    // the details assignment, which moves under the canonical zone.
    const removed = strip(before)
      .split("\n")
      .filter((line) => !strip(after).split("\n").includes(line));
    expect(removed.map((line) => line.trim())).toEqual([
      "AND v_existing_request_hash =",
      "public.quicklog_event_request_hash_pre_logged_at(",
      "p_grow_id,",
      "p_event_type,",
      "p_tent_id,",
      "p_plant_id,",
      "p_note,",
      "p_photo_url,",
      "p_occurred_at,",
      "p_sensor_snapshot,",
      "p_details,",
      "p_water,",
      "p_feed",
      "AND v_existing_request_hash = v_legacy_request_hash;",
      "v_call_details := jsonb_build_object(",
    ]);
    const code = added.join("\n");
    expect(code).not.toMatch(/INSERT|UPDATE|DELETE|GRANT|REVOKE|RETURN/);
    expect(code.match(/set_config\('TimeZone'/g)?.length ?? 0).toBe(3);
    expect(after.match(/pg_catalog\.set_config\(\s*'TimeZone'/g)).toHaveLength(4);
    expect(code).toContain("v_caller_time_zone text := pg_catalog.current_setting('TimeZone');");
  });

  it("restores the caller zone right after each switch, before any return", () => {
    const after = body(pinnedUtcHashSql(), WRAPPER);
    const legacySwitch = after.indexOf("PERFORM pg_catalog.set_config('TimeZone', 'UTC', true);");
    const legacyRestore = after.indexOf(
      "PERFORM pg_catalog.set_config('TimeZone', v_caller_time_zone, true);",
      legacySwitch,
    );
    expect(legacySwitch).toBeGreaterThan(0);
    expect(after.slice(legacySwitch, legacyRestore)).not.toContain("RETURN");
    const callSwitch = after.indexOf("PERFORM pg_catalog.set_config(\n        'TimeZone',");
    const delegateCall = after.indexOf(
      "v_result := public.quicklog_save_event_pre_logged_at(",
      callSwitch,
    );
    const callRestore = after.indexOf(
      "PERFORM pg_catalog.set_config('TimeZone', v_caller_time_zone, true);",
      delegateCall,
    );
    expect(callSwitch).toBeGreaterThan(legacyRestore);
    expect(delegateCall).toBeGreaterThan(callSwitch);
    expect(after.slice(callSwitch, callRestore)).not.toContain("RETURN");
    expect(after.slice(delegateCall, callRestore).trim().endsWith(");")).toBe(true);
  });

  it("runs in the dedicated disposable PG15 job for these paths", () => {
    const workflow = readFileSync(
      resolve(root, ".github/workflows/quicklog-event-replay-lock-pg15.yml"),
      "utf8",
    );
    expect(workflow).toContain(UTC_HASH_MIGRATION);
    expect(workflow).toContain("scripts/run-quicklog-event-request-hash-utc-pg15-harness.mjs");
    expect(workflow).toContain("src/test/quicklog-event-request-hash-utc-pg15-harness.test.ts");
    expect(workflow).toContain(
      "run: node scripts/run-quicklog-event-request-hash-utc-pg15-harness.mjs",
    );
  });
});
