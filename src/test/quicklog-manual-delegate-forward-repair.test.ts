import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MIGRATION_PATH = resolve(
  ROOT,
  "supabase/migrations/20260818010000_quicklog_manual_delegate_forward_repair.sql",
);
const sql = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, "utf8") : "";

const TYPE_SIGNATURE =
  "text, uuid, text, numeric, text, numeric, numeric, numeric, timestamp with time zone, jsonb, text, text";
const DELEGATE_CREATE =
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(?:"quicklog_save_manual_pre_logged_at"|quicklog_save_manual_pre_logged_at)\s*\([\s\S]*?\)\s*RETURNS\s+jsonb[\s\S]*?AS\s+(\$function\$|\$\$)([\s\S]*?)\1/i;

function normalizedDelegateBody(): string {
  return (sql.match(DELEGATE_CREATE)?.[2] ?? "").replace(/\r/g, "");
}

describe("quicklog manual delegate forward repair", () => {
  it("is a transaction-framed post-wrapper migration with a schema reload", () => {
    expect(sql).not.toBe("");
    expect(sql).toMatch(/^\s*--[\s\S]*?\bBEGIN\s*;/i);
    expect(sql).toMatch(/\bCOMMIT\s*;[\s\S]*?NOTIFY\s+pgrst\s*,\s*'reload schema'\s*;\s*$/i);
  });

  it("fails closed on the exact wrapper and two recognized delegate sources", () => {
    const mutationAt = sql.search(DELEGATE_CREATE);
    const preflightAt = sql.indexOf("$quicklog_manual_delegate_preflight$");

    expect(preflightAt).toBeGreaterThan(-1);
    expect(mutationAt).toBeGreaterThan(preflightAt);
    expect(sql.slice(0, mutationAt)).toContain("pg_catalog.replace(p.prosrc, E'\\r', '')");
    expect(sql.slice(0, mutationAt)).toContain("0d3098b81787fa90898da921345c0dbc");
    expect(sql.slice(0, mutationAt)).toContain("7752");
    expect(sql.slice(0, mutationAt)).toContain("e161b2e15c8de2e5ae1048edb4c72c3d");
    expect(sql.slice(0, mutationAt)).toContain("6548");
    expect(sql.slice(0, mutationAt)).toContain("7ec296e422f7f47c8b2793b051840798");
    expect(sql.slice(0, mutationAt)).toContain("6734");
    expect(sql.slice(0, mutationAt)).toContain("quicklog_manual_wrapper_unrecognized");
    expect(sql.slice(0, mutationAt)).toContain("quicklog_manual_delegate_unrecognized");
    expect(sql.slice(0, mutationAt)).toContain("v_wrapper_overload_count");
    expect(sql.slice(0, mutationAt)).toMatch(
      /INTO\s+v_wrapper_overload_count[\s\S]{0,250}p\.proname\s*=\s*'quicklog_save_manual'/,
    );
    expect(sql.slice(0, mutationAt)).toMatch(/v_wrapper_overload_count\s*<>\s*1/);
  });

  it("pins the exact catalog identity, ownership, defaults, security, and search path", () => {
    const preflight = sql.slice(0, sql.search(DELEGATE_CREATE));

    expect(preflight).toContain(TYPE_SIGNATURE);
    expect(preflight).toContain("quicklog_save_manual_pre_logged_at");
    expect(preflight).toMatch(/p\.prokind\s*=\s*'f'/);
    expect(preflight).toMatch(/p\.prorettype\s*=\s*'jsonb'::pg_catalog\.regtype/);
    expect(preflight).toMatch(/l\.lanname\s*=\s*'plpgsql'/);
    expect(preflight).toMatch(/p\.pronargdefaults\s*=\s*9/);
    expect(preflight).toContain("pg_get_function_arguments");
    expect(preflight).toMatch(/owner_role\.rolname\s*=\s*'postgres'/);
    expect(preflight).toMatch(/p\.prosecdef/);
    expect(preflight).toMatch(/NOT\s+p\.proisstrict/);
    expect(preflight).toContain("search_path=public, pg_temp");
    expect(preflight).toContain("p_target_type");
    expect(preflight).toContain("p_stage");
  });

  it("requires the logged-at columns, request fingerprint, and exact enabled row triggers", () => {
    const preflight = sql.slice(0, sql.search(DELEGATE_CREATE));

    expect(preflight).toContain("public.diary_entries");
    expect(preflight).toContain("public.grow_events");
    expect(preflight).toContain("logged_at");
    expect(preflight).toContain("public.quicklog_idempotency");
    expect(preflight).toContain("request_hash");
    expect(preflight.match(/NOT\s+a\.attnotnull/g) ?? []).toHaveLength(3);
    expect(preflight.match(/a\.atttypmod\s*=\s*-1/g) ?? []).toHaveLength(3);
    expect(preflight.match(/a\.attgenerated\s*=\s*''/g) ?? []).toHaveLength(3);
    expect(preflight.match(/a\.attidentity\s*=\s*''/g) ?? []).toHaveLength(3);
    expect(preflight.match(/pg_catalog\.pg_attrdef/g) ?? []).toHaveLength(3);
    expect(preflight).toContain("77f1aa70a70a9714057ef226b6996149");
    expect(preflight).toContain("a34d120aad5c37a33ac05fd9597624f4");
    expect(preflight).toContain("d9df46d36eb5d7aac767a3c87e53e92f");
    expect(preflight).toContain("postgres|EXECUTE|f|postgres");
    expect(preflight).toContain("v_helper_overload_count");
    expect(preflight).toMatch(
      /p\.proname\s+IN\s*\([\s\S]{0,300}quicklog_stamp_grow_event_logged_at/,
    );
    expect(preflight).toMatch(/has_function_privilege\(\s*'service_role',[\s\S]{0,100}p\.oid/);
    expect(preflight).toContain("trg_quicklog_stamp_diary_logged_at");
    expect(preflight).toContain("quicklog_stamp_diary_logged_at()");
    expect(preflight).toContain("trg_quicklog_stamp_grow_event_logged_at");
    expect(preflight).toContain("quicklog_stamp_grow_event_logged_at()");
    expect(preflight).toMatch(/tg\.tgtype\s*=\s*7/);
    expect(preflight).toMatch(/tg\.tgenabled\s*<>\s*'D'/);
    expect(preflight).toMatch(/tg\.tgqual\s+IS\s+NULL/);
    expect(preflight).toMatch(/tg\.tgnargs\s*=\s*0/);
    expect(preflight).toMatch(/octet_length\(tg\.tgargs\)\s*=\s*0/);
    expect(preflight).toMatch(/tg\.tgparentid\s*=\s*0/);
  });

  it("replaces only the internal delegate and explicitly removes every broad execute path", () => {
    expect(sql.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION/gi) ?? []).toHaveLength(1);
    expect(sql).toMatch(DELEGATE_CREATE);
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
    expect(sql).not.toMatch(/RENAME\s+TO/i);
    expect(sql).not.toMatch(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_manual\s*\(/i,
    );
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.quicklog_save_manual_pre_logged_at[\\s\\S]{0,300}FROM\\s+${role}`,
          "i",
        ),
      );
    }
    expect(sql).toMatch(/acl\.grantee\s*<>\s*v_delegate_owner/);
    expect(sql).toMatch(
      /NOT\s+pg_catalog\.has_function_privilege\(\s*'service_role',[\s\S]{0,120}v_wrapper_oid/,
    );
  });

  it("installs the independently pinned intended delegate source", () => {
    const body = normalizedDelegateBody();

    expect(body).toHaveLength(6734);
    expect(createHash("md5").update(body).digest("hex")).toBe("7ec296e422f7f47c8b2793b051840798");
    expect(body).toMatch(/INSERT\s+INTO\s+public\.diary_entries/i);
    expect(body).toMatch(/'linked_grow_event_id'\s*,\s*v_parent_event/i);
  });

  it("snapshots and asserts that the public wrapper OID, source, ACL, and service posture stay unchanged", () => {
    const postconditionAt = sql.indexOf("$quicklog_manual_delegate_postcondition$");

    expect(sql).toContain("verdant.quicklog_manual_delegate.wrapper_oid");
    expect(sql).toContain("verdant.quicklog_manual_delegate.wrapper_acl");
    expect(sql).toContain("verdant.quicklog_manual_delegate.wrapper_service_execute");
    expect(postconditionAt).toBeGreaterThan(sql.search(DELEGATE_CREATE));
    const postcondition = sql.slice(postconditionAt);
    expect(postcondition).toContain("current_setting");
    expect(postcondition).toContain("0d3098b81787fa90898da921345c0dbc");
    expect(postcondition).toContain("7752");
    expect(postcondition).toContain("p.proacl");
    expect(postcondition).toContain("has_function_privilege");
    expect(postcondition).toMatch(/NOT\s+p\.proisstrict/);
    expect(postcondition).toContain("v_wrapper_overload_count");
    expect(postcondition).toMatch(/v_wrapper_overload_count\s*<>\s*1/);
  });

  it("asserts the intended internal source and denies PUBLIC, client, and service execution", () => {
    const postconditionAt = sql.indexOf("$quicklog_manual_delegate_postcondition$");
    const postcondition = sql.slice(postconditionAt);

    expect(postcondition).toContain("7ec296e422f7f47c8b2793b051840798");
    expect(postcondition).toContain("6734");
    expect(postcondition).toContain("aclexplode");
    expect(postcondition).toContain("has_function_privilege('anon'");
    expect(postcondition).toContain("has_function_privilege('authenticated'");
    expect(postcondition).toContain("has_function_privilege('service_role'");
  });
});
