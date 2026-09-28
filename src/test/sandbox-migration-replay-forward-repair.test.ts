import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = resolve(
  __dirname,
  "../../supabase/migrations/20260928162000_sandbox_replay_forward_repairs.sql",
);

function readMigration() {
  return readFileSync(MIGRATION, "utf8");
}

describe("sandbox replay forward repair migration", () => {
  it("restores the legacy schema-audit wrapper only when the stricter overload already exists", () => {
    const sql = readMigration();

    expect(sql).toContain("to_regprocedure('public.admin_schema_audit(text[],text[])') IS NULL");
    expect(sql).toContain("to_regprocedure('public.admin_schema_audit(text[],text[],jsonb)') IS NOT NULL");
    expect(sql).toContain("SELECT public.admin_schema_audit(_migrations, _tables, '[]'::jsonb);");
  });

  it("creates legacy email queue signatures as service-role-only compatibility shims", () => {
    const sql = readMigration();

    expect(sql).toContain("CREATE FUNCTION public.email_queue_dispatch()");
    expect(sql).toContain("CREATE FUNCTION public.email_queue_wake()");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;");
  });

  it("rebuilds the keyed quicklog replay contract only when the missing signatures are absent", () => {
    const sql = readMigration();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.quicklog_revision_idempotency");
    expect(sql).toContain(
      "to_regprocedure('public.quicklog_revision_apply_once(text,text,text,jsonb,uuid,uuid,text)') IS NULL",
    );
    expect(sql).toContain(
      "to_regprocedure('public.quicklog_correct_entry(text,text,jsonb,uuid,uuid,text)') IS NULL",
    );
    expect(sql).toContain(
      "to_regprocedure('public.quicklog_retract_entry(text,text,uuid,uuid,text)') IS NULL",
    );
    expect(sql).toContain(
      "quicklog replay forward repair requires legacy correction/retraction RPCs",
    );
  });

  it("reasserts authenticated has_role execute without reopening public access", () => {
    const sql = readMigration();

    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;",
    );
  });
});
