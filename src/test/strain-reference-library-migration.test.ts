import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260722203000_strain_reference_library_v1.sql"),
  "utf8",
);

describe("Strain Reference Library V1 migration", () => {
  it("creates the source-backed identity, claim, versioned guide, and import staging model", () => {
    for (const table of [
      "breeders",
      "cultivars",
      "cultivar_aliases",
      "cultivar_sources",
      "cultivar_claims",
      "cultivar_guide_templates",
      "cultivar_guides",
      "cultivar_guide_sections",
      "cultivar_guide_section_sources",
      "cultivar_import_batches",
      "cultivar_import_rows",
    ]) {
      expect(SQL).toContain(`create table if not exists public.${table}`);
    }
    expect(SQL).toContain("supersedes_id uuid references public.cultivar_guides");
    expect(SQL).toContain("content jsonb not null");
    expect(SQL).toContain("coalesce(breeder_id, '00000000-0000-0000-0000-000000000000'::uuid)");
    expect(SQL).toContain("seed_expression");
    expect(SQL).not.toMatch(/canonical_name\s+text\s+not\s+null\s+unique/i);
    expect(SQL).toContain("file_checksum text not null unique");
    expect(SQL).toContain("insert into public.cultivar_guide_section_sources");
    expect(SQL).toContain("Supports the reported cultivar tendency in this overview");
  });

  it("adds full-text, trigram, filter, and published partial indexes", () => {
    expect(SQL).toContain("create extension if not exists pg_trgm");
    expect(SQL).toContain("cultivars_search_document_gin_idx");
    expect(SQL).toContain("cultivars_normalized_name_trgm_idx");
    expect(SQL).toContain("cultivar_aliases_normalized_trgm_idx");
    expect(SQL).toContain("where publication_status = 'published'");
  });

  it("is client read-only and keeps import staging server/admin-only", () => {
    expect(SQL).toContain("grant select on public.cultivars to anon, authenticated");
    expect(SQL).toContain("revoke all on public.cultivar_import_batches from public, anon, authenticated");
    expect(SQL).not.toMatch(/grant\s+(insert|update|delete|all).*to\s+(anon|authenticated)/i);
    expect(SQL).not.toMatch(/create policy[\s\S]{0,120}for\s+(insert|update|delete)/i);
  });

  it("does not touch the One-Tent Loop, sensor, AI, alert, or action tables", () => {
    for (const protectedTable of [
      "plants",
      "grows",
      "tents",
      "sensor_readings",
      "alerts",
      "action_queue",
      "ai_doctor_sessions",
    ]) {
      expect(SQL).not.toMatch(new RegExp(`alter table public\\.${protectedTable}\\b`, "i"));
      expect(SQL).not.toMatch(new RegExp(`insert into public\\.${protectedTable}\\b`, "i"));
      expect(SQL).not.toMatch(new RegExp(`update public\\.${protectedTable}\\b`, "i"));
    }
  });
});
