/**
 * Static guardrails for the merge_duplicate_plant RPC migration.
 *
 * No client wiring is exercised here. We assert on the migration SQL
 * itself so the safety contract documented in
 * docs/plant-merge-execution-plan.md cannot silently regress.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

function findRpcMigration(): { path: string; sql: string } | null {
  if (!existsSync(MIG_DIR)) return null;
  for (const name of readdirSync(MIG_DIR)) {
    const p = join(MIG_DIR, name);
    const sql = readFileSync(p, "utf8");
    if (
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.merge_duplicate_plant/i.test(
        sql,
      )
    ) {
      return { path: p, sql };
    }
  }
  return null;
}

describe("merge_duplicate_plant RPC — migration exists", () => {
  it("a migration defines public.merge_duplicate_plant", () => {
    expect(findRpcMigration()).not.toBeNull();
  });
});

describe("merge_duplicate_plant RPC — signature & safety", () => {
  const mig = findRpcMigration();
  const sql = mig?.sql ?? "";

  it.each([
    ["takes source_plant_id uuid", /source_plant_id\s+uuid/i],
    ["takes target_plant_id uuid", /target_plant_id\s+uuid/i],
    ["returns jsonb", /returns\s+jsonb/i],
    ["is SECURITY DEFINER", /security\s+definer/i],
    [
      "pins search_path to public, pg_temp",
      /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i,
    ],
    ["checks auth.uid() is not null", /auth\.uid\(\)[\s\S]{0,200}not\s+authenticated/i],
    [
      "rejects same source and target",
      /source_plant_id\s*=\s*target_plant_id[\s\S]{0,200}must\s+differ/i,
    ],
    [
      "verifies source ownership",
      /source\s+plant\s+not\s+found\s+or\s+not\s+owned\s+by\s+caller/i,
    ],
    [
      "verifies target ownership",
      /target\s+plant\s+not\s+found\s+or\s+not\s+owned\s+by\s+caller/i,
    ],
    [
      "blocks cross-grow merges",
      /cross-grow\s+merges\s+are\s+not\s+supported/i,
    ],
    ["rejects repeat merges", /plant_already_merged/i],
    [
      "reassigns grow_events.plant_id",
      /update\s+public\.grow_events[\s\S]{0,200}set\s+plant_id\s*=\s*target_plant_id/i,
    ],
    [
      "reassigns diary_entries.plant_id",
      /update\s+public\.diary_entries[\s\S]{0,200}set\s+plant_id\s*=\s*target_plant_id/i,
    ],
    [
      "reassigns alerts.plant_id",
      /update\s+public\.alerts[\s\S]{0,200}set\s+plant_id\s*=\s*target_plant_id/i,
    ],
    [
      "reassigns action_queue.plant_id",
      /update\s+public\.action_queue[\s\S]{0,200}set\s+plant_id\s*=\s*target_plant_id/i,
    ],
    [
      "archives source plant (sets is_archived = true)",
      /update\s+public\.plants[\s\S]{0,400}is_archived\s*=\s*true/i,
    ],
    [
      "returns a moved summary object",
      /jsonb_build_object\([\s\S]{0,1500}'moved'/i,
    ],
    ["reports source_status archived_as_merged", /archived_as_merged/i],
    ["REVOKEs from anon", /revoke\s+all[\s\S]{0,200}from\s+anon/i],
    [
      "GRANTs EXECUTE to authenticated",
      /grant\s+execute[\s\S]{0,200}to\s+authenticated/i,
    ],
  ])("RPC migration %s", (_label, re) => {
    expect(sql).toMatch(re);
  });

  it("never hard-deletes from public.plants", () => {
    expect(sql).not.toMatch(/delete\s+from\s+public\.plants/i);
  });

  it("does not touch sensor_readings / pi_ingest tables", () => {
    expect(sql).not.toMatch(/update\s+public\.sensor_readings/i);
    expect(sql).not.toMatch(/update\s+public\.pi_ingest_/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.sensor_readings/i);
  });

  it("does not grant execute to anon or service_role", () => {
    expect(sql).not.toMatch(/grant\s+execute[\s\S]{0,200}to\s+anon/i);
    expect(sql).not.toMatch(/grant\s+execute[\s\S]{0,200}to\s+service_role/i);
  });

  it("contains every plant-linked owner filter (defense in depth)", () => {
    // Each UPDATE additionally filters on user_id = uid even though the
    // function is SECURITY DEFINER, mirroring the documented contract.
    const matches = sql.match(/user_id\s*=\s*uid/gi) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
});

describe("merge_duplicate_plant RPC — not yet wired into client", () => {
  it("plantMergeRules.ts does not call the RPC yet", () => {
    const rulesPath = resolve(ROOT, "src/lib/plantMergeRules.ts");
    if (!existsSync(rulesPath)) return; // file optional
    const src = readFileSync(rulesPath, "utf8");
    expect(src).not.toMatch(/merge_duplicate_plant/);
  });

  it("PlantMergeDialog does not call the RPC yet", () => {
    const dlgPath = resolve(ROOT, "src/components/PlantMergeDialog.tsx");
    if (!existsSync(dlgPath)) return;
    const src = readFileSync(dlgPath, "utf8");
    expect(src).not.toMatch(/merge_duplicate_plant/);
  });
});
