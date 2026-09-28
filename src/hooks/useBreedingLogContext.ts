import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildGrowScopedPlantsOrFilter } from "@/lib/growAttributionRules";

interface PlantOption {
  id: string;
  name: string;
  tent_id: string | null;
}

interface Context {
  grow: { id: string; name: string } | null;
  plants: PlantOption[];
}

type ReadState =
  | { key: string; status: "loading" }
  | { key: string; status: "unavailable" }
  | { key: string; status: "ready"; context: Context };

async function readContext(growId: string, tentId: string | null): Promise<Context> {
  // Preserve canonical grow attribution, including plants attributed via tents.
  // A failed tent read cannot establish the complete candidate set.
  const tents = await supabase.from("tents").select("id").eq("grow_id", growId);
  if (tents.error || !Array.isArray(tents.data)) throw new Error("Tent read unavailable");
  const tentIds = tents.data.map((tent) => tent.id).filter((id) => !!id);
  const [grow, plants] = await Promise.all([
    supabase.from("grows").select("id,name").eq("id", growId).maybeSingle(),
    (() => {
      let query = supabase
        .from("plants")
        .select("id,name,tent_id")
        .or(buildGrowScopedPlantsOrFilter(growId, tentIds))
        .eq("is_archived", false);
      if (tentId) query = query.eq("tent_id", tentId);
      return query;
    })(),
  ]);
  if (grow.error || plants.error || !Array.isArray(plants.data)) {
    throw new Error("Breeding context unavailable");
  }
  return {
    grow: grow.data ? { id: grow.data.id, name: grow.data.name } : null,
    plants: plants.data.map((plant) => ({
      id: plant.id,
      name: plant.name,
      tent_id: plant.tent_id ?? null,
    })),
  };
}

/** Never pair a new URL scope with plant choices from an earlier read. */
export function useBreedingLogContext(growId: string | null, tentId: string | null) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([growId, tentId, attempt]);
  const [state, setState] = useState<ReadState>({ key, status: "loading" });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!growId) return;
    setState({ key, status: "loading" });
    void readContext(growId, tentId).then(
      (context) => {
        if (!cancelled) setState({ key, status: "ready", context });
      },
      () => {
        if (!cancelled) setState({ key, status: "unavailable" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [growId, tentId, key]);

  // Gate synchronously, before the effect clears the old state. Including the
  // retry attempt also removes failed context while a retry is starting.
  const current: ReadState = !growId
    ? { key, status: "ready", context: { grow: null, plants: [] } }
    : state.key === key
      ? state
      : { key, status: "loading" };
  return { ...current, retry };
}
