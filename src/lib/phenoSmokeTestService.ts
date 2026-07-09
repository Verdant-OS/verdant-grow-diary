/**
 * phenoSmokeTestService — RLS-scoped read/write for the post-cure smoke test
 * (pheno_smoke_tests): flavor + effect descriptors, smoothness, potency feel,
 * verdict. One canonical result per candidate.
 *
 * A normal user-data write of the grower's OWN cure-time impression, enforced
 * by RLS (owner + owns hunt + owns plant + candidate consistency). HONEST:
 * potency is a SUBJECTIVE 1-5 feel, not a lab number. No service_role, no AI,
 * no automation. Descriptive only.
 */
import { supabase } from "@/integrations/supabase/client";
import { phenoDb } from "@/integrations/supabase/phenoTables";

export interface SmokeTestRow {
  readonly plantId: string;
  readonly flavorDescriptors: readonly string[];
  readonly effectDescriptors: readonly string[];
  readonly smoothness: number | null;
  readonly potencyImpression: number | null;
  readonly verdict: string | null;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function clamp1to5(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
}

/** Upsert the post-cure smoke test for one candidate (one per hunt+plant). */
export async function upsertSmokeTest(input: {
  huntId: string;
  plantId: string;
  flavorDescriptors?: readonly string[];
  effectDescriptors?: readonly string[];
  smoothness?: number | null;
  potencyImpression?: number | null;
  verdict?: string | null;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to save a smoke test." };
  const { error } = await phenoDb.from("pheno_smoke_tests").upsert(
    {
      user_id: userId,
      hunt_id: input.huntId,
      plant_id: input.plantId,
      flavor_descriptors: [...(input.flavorDescriptors ?? [])],
      effect_descriptors: [...(input.effectDescriptors ?? [])],
      smoothness: clamp1to5(input.smoothness),
      potency_impression: clamp1to5(input.potencyImpression),
      verdict: input.verdict ?? null,
    },
    { onConflict: "hunt_id,plant_id" },
  );
  if (error) return { ok: false, error: "Could not save this smoke test." };
  return { ok: true };
}

/** Load smoke tests for a hunt, keyed by plant id. RLS-scoped read. */
export async function listSmokeTestsForHunt(huntId: string): Promise<Record<string, SmokeTestRow>> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return {};
  const { data, error } = await phenoDb
    .from("pheno_smoke_tests")
    .select(
      "plant_id, flavor_descriptors, effect_descriptors, smoothness, potency_impression, verdict",
    )
    .eq("hunt_id", id);
  if (error || !data) return {};
  const map: Record<string, SmokeTestRow> = {};
  for (const row of data) {
    if (!row.plant_id) continue;
    map[row.plant_id] = {
      plantId: row.plant_id,
      flavorDescriptors: stringArray(row.flavor_descriptors),
      effectDescriptors: stringArray(row.effect_descriptors),
      smoothness: typeof row.smoothness === "number" ? row.smoothness : null,
      potencyImpression: typeof row.potency_impression === "number" ? row.potency_impression : null,
      verdict: row.verdict ?? null,
    };
  }
  return map;
}
