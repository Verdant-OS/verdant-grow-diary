import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CULTIVAR_SEED_PAYLOAD_TAG } from "@/lib/cultivarDatabaseSeedPayloadRules";

/**
 * @source-scan-justified: a migration is SQL text that no test process can
 * execute; the runtime proof is scripts/run-cultivar-reference-rls-harness.ts
 * in the security-db-local lane. These assertions fence forbidden constructs.
 */
const FILE = "20260930200000_strain_reference_library_v1_1_parity.sql";
const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const SQL = readFileSync(resolve(MIGRATIONS, FILE), "utf8");
const TAG = `$${CULTIVAR_SEED_PAYLOAD_TAG}$`;
// Everything except the JSON payload and SQL comments: the executable statements.
const STATEMENTS = (SQL.slice(0, SQL.indexOf(TAG)) + SQL.slice(SQL.lastIndexOf(TAG) + TAG.length))
  .replace(/--.*$/gm, "")
  .toLowerCase();

describe("Strain Reference Library V1.1 parity migration", () => {
  it("sorts after every published migration, including V1", () => {
    const files = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(files.at(-1)).toBe(FILE);
    expect(files.indexOf("20260722203000_strain_reference_library_v1.sql")).toBeLessThan(
      files.indexOf(FILE),
    );
  });

  it("leaves the published V1 migration byte-identical", () => {
    const v1 = readFileSync(resolve(MIGRATIONS, "20260722203000_strain_reference_library_v1.sql"));
    const config = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "config/local-supabase-replay-compatibility.json"),
        "utf8",
      ),
    ) as { compatibility_patches: { source_path: string; source_sha256: string }[] };
    const patch = config.compatibility_patches.find((entry) =>
      entry.source_path.endsWith("20260722203000_strain_reference_library_v1.sql"),
    );
    expect(createHash("sha256").update(v1).digest("hex")).toBe(patch?.source_sha256);
  });

  it("adds only the parity supplement, idempotently", () => {
    for (const fragment of [
      "add column if not exists flowering_window_label text",
      "add column if not exists pheno_hunt_focus text[] not null default '{}'",
      "add column if not exists sample_phenos jsonb not null default '[]'::jsonb",
      "add column if not exists sort_order integer",
      "create table if not exists public.cultivar_profile_sources",
    ]) {
      expect(STATEMENTS).toContain(fragment);
    }
    expect(STATEMENTS).not.toMatch(/\bdrop\s+(table|column|schema|function|view)\b/);
    expect(STATEMENTS).not.toMatch(/\btruncate\b|\bdelete\s+from\b/);
    expect(STATEMENTS).not.toMatch(/\balter\s+column\b/);
  });

  it("protects the new join with published-only RLS and SELECT-only grants", () => {
    expect(STATEMENTS).toContain(
      "alter table public.cultivar_profile_sources enable row level security",
    );
    expect(STATEMENTS).toContain(
      "revoke all on public.cultivar_profile_sources from public, anon, authenticated",
    );
    expect(STATEMENTS).toMatch(
      /create policy "public can read sources of published cultivars"\s+on public\.cultivar_profile_sources for select to anon, authenticated\s+using \(exists \(\s+select 1 from public\.cultivars c\s+where c\.id = cultivar_profile_sources\.cultivar_id\s+and c\.publication_status = 'published'/,
    );
    const grants = STATEMENTS.match(/\bgrant\s+[^;]+;/g) ?? [];
    expect(grants).toEqual([
      "grant select on public.cultivar_profile_sources to anon, authenticated;",
    ]);
    expect(STATEMENTS).not.toMatch(/for\s+(insert|update|delete|all)\b/);
  });

  it("creates no definer functions, views, or role changes", () => {
    expect(STATEMENTS).not.toMatch(/security\s+definer/);
    expect(STATEMENTS).not.toMatch(/create\s+(or\s+replace\s+)?(function|view|role|trigger)/);
    expect(STATEMENTS).not.toMatch(/\bset\s+role\b|\bbypassrls\b/);
  });

  it("never aborts replay", () => {
    expect(STATEMENTS).not.toMatch(/\braise\s+(exception|error)\b/);
  });

  it("touches no One-Tent Loop, AI, alert, Action Queue, or sensor table", () => {
    for (const table of [
      "plants",
      "grows",
      "tents",
      "sensor_readings",
      "alerts",
      "action_queue",
      "ai_doctor_sessions",
      "ai_credit_ledger",
      "profiles",
      "subscriptions",
    ]) {
      expect(STATEMENTS).not.toMatch(new RegExp(`public\\.${table}\\b`));
    }
    const writes = STATEMENTS.match(/\b(insert into|update)\s+public\.([a-z_]+)/g) ?? [];
    const targets = new Set(writes.map((write) => write.split("public.")[1]));
    expect([...targets].sort()).toEqual([
      "breeders",
      "cultivar_aliases",
      "cultivar_claims",
      "cultivar_guide_section_sources",
      "cultivar_guide_sections",
      "cultivar_guides",
      "cultivar_profile_sources",
      "cultivar_sources",
      "cultivars",
    ]);
  });

  it("upserts every content write on a natural or stable key", () => {
    const inserts = STATEMENTS.split(/(?=insert into public\.)/).slice(1);
    expect(inserts).toHaveLength(9);
    for (const insert of inserts) {
      expect(insert).toMatch(/on conflict/);
    }
    expect(STATEMENTS).toMatch(/where not exists \(/);
  });

  it("carries exactly one parseable payload that keeps the sample-reference label", () => {
    expect(SQL.split(TAG)).toHaveLength(3);
    const payload = JSON.parse(SQL.split(TAG)[1]) as {
      cultivars: { verification_status: string; data_origin: string; publication_status: string }[];
    };
    expect(payload.cultivars).toHaveLength(10);
    for (const cultivar of payload.cultivars) {
      expect(cultivar.verification_status).toBe("sample");
      expect(cultivar.data_origin).toBe("seed");
      expect(cultivar.publication_status).toBe("published");
    }
  });
});
