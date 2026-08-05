import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  extractMountedAppRoutePaths,
  isMountedUnderOperatorLayout,
  readAllRouteModuleSources,
} from "./helpers/routeManifestSyncHarness";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const APP = readAllRouteModuleSources();
const PAGE = read("src/pages/OperatorSchemaAudit.tsx");
const SIDEBAR = read("src/components/AppSidebar.tsx");
const MIGRATION = read("supabase/migrations/20260728103000_schema_audit_trust_hardening.sql");

describe("Operator Schema Audit integration", () => {
  it("declares the route as operator-only in both the router and route manifest", () => {
    expect(extractMountedAppRoutePaths()).toContain("/operator/schema-audit");
    expect(isMountedUnderOperatorLayout("/operator/schema-audit")).toBe(true);
    expect(APP_ROUTES.find((route) => route.path === "/operator/schema-audit")).toMatchObject({
      access: "operator",
    });
  });

  it("keeps the surface read-only and discoverable only inside Operator Mode", () => {
    const operatorGroup = SIDEBAR.slice(
      SIDEBAR.indexOf('label: "Operator Mode"'),
      SIDEBAR.indexOf("export default function AppSidebar"),
    );
    expect(operatorGroup).toContain(
      '{ to: "/operator/schema-audit", label: "Schema Audit", icon: Database }',
    );
    expect(PAGE).toContain("bounded read-only snapshot");
    expect(PAGE).not.toMatch(/\.(?:insert|update|upsert|delete)\s*\(/);
  });

  it("pins the SECURITY DEFINER path, re-authorizes server-side, and exposes one role", () => {
    expect(MIGRATION).toContain("SECURITY DEFINER");
    expect(MIGRATION).toContain("SET search_path = pg_catalog");
    expect(MIGRATION).toContain("_uid uuid := auth.uid()");
    expect(MIGRATION).toContain("public.has_role(_uid, 'operator'::public.app_role)");
    expect(MIGRATION).toContain("public.has_role(_uid, 'staff'::public.app_role)");
    expect(MIGRATION).toContain(
      "DROP FUNCTION IF EXISTS public.admin_schema_audit(text[], text[])",
    );
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_schema_audit\(text\[\], text\[\], jsonb\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_schema_audit\(text\[\], text\[\], jsonb\)\s+TO authenticated;/,
    );
    expect(MIGRATION).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_schema_audit[\s\S]*TO (?:PUBLIC|anon|service_role);/,
    );
  });

  it("uses only exact version or exact canonical-name ledger matches and exposes collisions", () => {
    expect(MIGRATION).toContain("ledger.version = parsed.version");
    expect(MIGRATION).toContain("= parsed.canonical_name");
    expect(MIGRATION).toContain("'match_kind'");
    expect(MIGRATION).toContain("'exact_version'");
    expect(MIGRATION).toContain("'canonical_name'");
    expect(MIGRATION).toContain("'ambiguous'");
    expect(MIGRATION).toContain("'candidate_count'");
    expect(MIGRATION).not.toMatch(
      /\binterval\b|timestampdiff|extract\s*\(\s*epoch|nearest|proximity/i,
    );
  });

  it("returns policy definitions plus direct PUBLIC and browser-role table/column grants", () => {
    expect(MIGRATION).toContain("pg_catalog.pg_policies");
    expect(MIGRATION).toContain("'name', policy.policyname");
    expect(MIGRATION).toContain("'command', policy.cmd");
    expect(MIGRATION).toContain("'roles', pg_catalog.to_jsonb(policy.roles)");
    expect(MIGRATION).toContain("'permissive'");
    expect(MIGRATION).toContain("'qual', policy.qual");
    expect(MIGRATION).toContain("'with_check', policy.with_check");
    expect(MIGRATION).toContain("'PUBLIC'::text");
    expect(MIGRATION).toContain("('anon'::text), ('authenticated'::text), ('service_role'::text)");
    expect(MIGRATION).toContain("pg_catalog.aclexplode");
    expect(MIGRATION).toContain("attribute.attacl");
    expect(MIGRATION).toContain("'column_grants', column_grants_by_table.column_grants");
  });

  it("returns bounded catalog evidence with identity, checked time, and fingerprint", () => {
    expect(MIGRATION).toContain("supabase_migrations.schema_migrations");
    expect(MIGRATION).toContain("pg_catalog.pg_class");
    expect(MIGRATION).toContain("pg_catalog.pg_attribute");
    expect(MIGRATION).toContain("'user_id', pg_catalog.to_jsonb(_uid)");
    expect(MIGRATION).toContain("'checked_at'");
    expect(MIGRATION).toContain("'snapshot_fingerprint'");
    expect(MIGRATION).not.toContain("SELECT *");
  });

  it("gates all green UI on the complete ready trust state", () => {
    expect(PAGE).toContain('const snapshotReady = trust.state === "ready"');
    expect(PAGE).toContain('data-testid="schema-audit-trust-state"');
    expect(PAGE).toContain("data-state={trust.state}");
    expect(PAGE).toContain("Complete snapshot:");
    expect(PAGE).toContain("schemaAuditChecklistScope");
    expect(PAGE).toContain("columnEvidence={columnsByContract}");
  });
});
