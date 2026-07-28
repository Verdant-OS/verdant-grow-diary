import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { APP_ROUTES } from "@/lib/appRouteManifest";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const APP = read("src/App.tsx");
const PAGE = read("src/pages/OperatorSchemaAudit.tsx");
const SIDEBAR = read("src/components/AppSidebar.tsx");
const MIGRATION = read(
  "supabase/migrations/20260728084921_6b0b588b-bccb-404d-9932-22453df007c5.sql",
);

describe("Operator Schema Audit integration", () => {
  it("declares the route as operator-only in both the router and route manifest", () => {
    expect(APP).toContain('path="/operator/schema-audit"');
    expect(APP.indexOf('path="/operator/schema-audit"')).toBeGreaterThan(
      APP.indexOf("<Route element={<RequireOperatorRole />}>"),
    );
    expect(APP_ROUTES.find((route) => route.path === "/operator/schema-audit")).toMatchObject({
      access: "operator",
    });
  });

  it("makes the read-only audit discoverable only inside Operator Mode", () => {
    const operatorGroup = SIDEBAR.slice(
      SIDEBAR.indexOf('label: "Operator Mode"'),
      SIDEBAR.indexOf("export default function AppSidebar"),
    );

    expect(operatorGroup).toContain(
      '{ to: "/operator/schema-audit", label: "Schema Audit", icon: Database }',
    );
    expect(PAGE).toContain("Read-only.");
    expect(PAGE).not.toMatch(/\.(?:insert|update|upsert|delete)\s*\(/);
  });

  it("keeps the SECURITY DEFINER RPC role-gated and read-only", () => {
    expect(MIGRATION).toContain("SECURITY DEFINER");
    expect(MIGRATION).toContain("IF _uid IS NULL THEN");
    expect(MIGRATION).toContain("public.has_role(_uid, 'operator'::public.app_role)");
    expect(MIGRATION).toContain("public.has_role(_uid, 'staff'::public.app_role)");
    expect(MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.admin_schema_audit(text[], text[]) FROM PUBLIC",
    );
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.admin_schema_audit(text[], text[]) TO authenticated",
    );
    expect(MIGRATION).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i);
  });

  it("reads only the migration ledger and table catalog without returning row data", () => {
    expect(MIGRATION).toContain("supabase_migrations.schema_migrations");
    expect(MIGRATION).toContain("pg_tables");
    expect(MIGRATION).toContain("'filename', p.filename");
    expect(MIGRATION).toContain("'applied', sm.version IS NOT NULL");
    expect(MIGRATION).toContain("'table', i.table_name");
    expect(MIGRATION).toContain("'exists', t.tablename IS NOT NULL");
    expect(MIGRATION).not.toContain("SELECT *");
  });
});
