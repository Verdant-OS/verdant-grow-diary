/**
 * usePlantLabTests — read-only loader for the Plant Detail "Lab results"
 * panel. Selects only the display columns, never `select("*")`.
 *
 * Degrades to `null` (panel hidden) on ANY read error — most importantly the
 * case where the lab_tests migration has not been applied to the target
 * database yet (relation missing). The panel is a garnish evidence surface
 * and must never block or error the page. `null` = unavailable; `[]` = the
 * table is reachable and this plant simply has no results yet.
 *
 * Read-only. RLS enforces ownership (lab_tests_select_own). No writes, no
 * RPC, no AI call. `lab_tests` is not in generated types until the migration
 * is applied and types are regenerated, hence the `as never` casts.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import type { LabTestRow } from "@/lib/labResultsRules";

interface LabTestDbRow {
  id: string;
  tested_at: string | null;
  created_at: string | null;
  thca_percent: number | null;
  thc_percent: number | null;
  cbda_percent: number | null;
  cbd_percent: number | null;
  terpenes: unknown;
  lab_name: string | null;
  note: string | null;
}

export function usePlantLabTests(plantId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery<LabTestRow[] | null>({
    queryKey: ["lab_tests", "plant", user?.id ?? null, plantId ?? null],
    enabled: !!user && !!plantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_tests" as never)
        .select(
          "id, tested_at, created_at, thca_percent, thc_percent, cbda_percent, cbd_percent, terpenes, lab_name, note",
        )
        .eq("plant_id", plantId as string)
        // Date-only entry makes same-day tests share midnight; created_at
        // then id keep the order deterministic across refreshes.
        .order("tested_at", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });
      if (error) return null; // unavailable — panel stays quietly absent
      return ((data ?? []) as unknown as LabTestDbRow[]).map((r) => ({
        id: r.id,
        testedAt: r.tested_at,
        createdAt: r.created_at,
        thcaPercent: r.thca_percent,
        thcPercent: r.thc_percent,
        cbdaPercent: r.cbda_percent,
        cbdPercent: r.cbd_percent,
        terpenes: r.terpenes,
        labName: r.lab_name,
        note: r.note,
      }));
    },
  });
}
