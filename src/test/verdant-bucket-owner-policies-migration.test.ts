/**
 * Static guardrails for verdant-bucket owner-scoped UPDATE/DELETE policies
 * + bridge-credentials least-privilege posture.
 *
 * Scope:
 *  - Verify the migration scopes UPDATE/DELETE policies to bucket_id='verdant'
 *    and owner-path (auth.uid()::text = first folder).
 *  - Verify the migration does NOT flip any bucket to public.
 *  - Verify the migration does NOT add a permissive `USING (true)` or
 *    `WITH CHECK (true)` clause.
 *  - Verify the migration does NOT add service_role exposure or any
 *    SELECT/INSERT/UPDATE policy that would expose `pi_ingest_bridge_credentials`
 *    raw secret columns to authenticated clients.
 *  - Verify no app code or this migration broadens SELECT on
 *    `pi_ingest_bridge_credentials` to anon/authenticated.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../supabase/migrations/20260619003613_4dda0b4a-c323-4351-8b8d-99eb704b2f51.sql",
);
const SQL = readFileSync(MIGRATION_PATH, "utf8");

describe("verdant-bucket owner-scoped UPDATE/DELETE policies (migration)", () => {
  it("creates an UPDATE policy on storage.objects", () => {
    expect(SQL).toMatch(
      /CREATE\s+POLICY\s+"Users update own verdant objects"[\s\S]*FOR\s+UPDATE/i,
    );
  });

  it("creates a DELETE policy on storage.objects", () => {
    expect(SQL).toMatch(
      /CREATE\s+POLICY\s+"Users delete own verdant objects"[\s\S]*FOR\s+DELETE/i,
    );
  });

  it("UPDATE policy is scoped to bucket_id = 'verdant'", () => {
    const updateBlock = SQL.match(
      /CREATE\s+POLICY\s+"Users update own verdant objects"[\s\S]*?;/i,
    )?.[0];
    expect(updateBlock).toBeTruthy();
    expect(updateBlock!).toMatch(/bucket_id\s*=\s*'verdant'/);
  });

  it("DELETE policy is scoped to bucket_id = 'verdant'", () => {
    const deleteBlock = SQL.match(
      /CREATE\s+POLICY\s+"Users delete own verdant objects"[\s\S]*?;/i,
    )?.[0];
    expect(deleteBlock).toBeTruthy();
    expect(deleteBlock!).toMatch(/bucket_id\s*=\s*'verdant'/);
  });

  it("UPDATE policy is owner-path scoped (auth.uid() = first folder)", () => {
    const updateBlock = SQL.match(
      /CREATE\s+POLICY\s+"Users update own verdant objects"[\s\S]*?;/i,
    )?.[0]!;
    expect(updateBlock).toMatch(/storage\.foldername\(name\)\)\[1\]/);
    expect(updateBlock).toMatch(/auth\.uid\(\)/);
  });

  it("DELETE policy is owner-path scoped (auth.uid() = first folder)", () => {
    const deleteBlock = SQL.match(
      /CREATE\s+POLICY\s+"Users delete own verdant objects"[\s\S]*?;/i,
    )?.[0]!;
    expect(deleteBlock).toMatch(/storage\.foldername\(name\)\)\[1\]/);
    expect(deleteBlock).toMatch(/auth\.uid\(\)/);
  });

  it("policies are granted only TO authenticated (not anon, not public)", () => {
    const allPolicyBlocks =
      SQL.match(
        /CREATE\s+POLICY\s+"Users (?:update|delete) own verdant objects"[\s\S]*?;/gi,
      ) ?? [];
    expect(allPolicyBlocks.length).toBe(2);
    for (const b of allPolicyBlocks) {
      expect(b).toMatch(/TO\s+authenticated\b/i);
      expect(b).not.toMatch(/TO\s+anon\b/i);
      expect(b).not.toMatch(/TO\s+public\b/i);
    }
  });

  it("does NOT flip any storage bucket to public", () => {
    expect(SQL).not.toMatch(/storage\.buckets/i);
    expect(SQL).not.toMatch(/public\s*=\s*true/i);
    expect(SQL).not.toMatch(/SET\s+public/i);
  });

  it("does NOT use permissive USING (true) / WITH CHECK (true)", () => {
    expect(SQL).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(SQL).not.toMatch(/WITH\s+CHECK\s*\(\s*true\s*\)/i);
  });

  it("does NOT touch pi_ingest_bridge_credentials", () => {
    expect(SQL).not.toMatch(/pi_ingest_bridge_credentials/i);
  });

  it("does NOT add service_role exposure or secret tokens", () => {
    expect(SQL).not.toMatch(/service_role/i);
    expect(SQL).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
    expect(SQL).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  it("does NOT alter unrelated tables/buckets (only storage.objects policies)", () => {
    // No CREATE TABLE, no ALTER TABLE, no DROP TABLE.
    expect(SQL).not.toMatch(/CREATE\s+TABLE/i);
    expect(SQL).not.toMatch(/ALTER\s+TABLE/i);
    expect(SQL).not.toMatch(/DROP\s+TABLE/i);
    // Only policies on storage.objects.
    const targets = SQL.match(/ON\s+([a-z_.]+)/gi) ?? [];
    for (const t of targets) {
      expect(t.toLowerCase()).toMatch(/storage\.objects/);
    }
  });
});

describe("bridge credentials remain server-only (no broad SELECT exposure)", () => {
  it("migration does not add any SELECT/INSERT/UPDATE/DELETE policy on the table", () => {
    expect(SQL).not.toMatch(/pi_ingest_bridge_credentials/i);
  });

  it("migration does not GRANT SELECT on the table to anon/authenticated", () => {
    expect(SQL).not.toMatch(
      /GRANT[\s\S]*pi_ingest_bridge_credentials[\s\S]*TO\s+(anon|authenticated|public)/i,
    );
  });
});
