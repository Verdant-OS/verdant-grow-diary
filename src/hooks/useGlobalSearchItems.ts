import { useEffect, useMemo, useState } from "react";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import { fetchPlants, fetchTents } from "@/lib/growRepo";
import { buildGlobalSearchItems, type GlobalSearchItem } from "@/lib/globalSearchItems";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import type { Plant, Tent } from "@/mock";

export interface UseGlobalSearchItemsResult {
  items: readonly GlobalSearchItem[];
  loading: boolean;
  error: boolean;
}

/**
 * Loads owner-scoped entity names only while the palette is open. Public
 * cultivar references and static routes are always available. RLS remains the
 * authority for private rows; failures never fall back to demo data.
 */
export function useGlobalSearchItems(enabled: boolean): UseGlobalSearchItemsResult {
  const { user } = useAuth();
  const growsContext = useGrows();
  const grows = growsContext.grows ?? [];
  const growsLoading = growsContext.loading ?? false;
  const growsError = growsContext.error ?? null;
  const [rows, setRows] = useState<{ tents: Tent[]; plants: Plant[] }>({
    tents: [],
    plants: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled || !user?.id) {
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setRows({ tents: [], plants: [] });
    setLoading(true);
    setError(false);

    Promise.all([fetchTents(), fetchPlants()])
      .then(([tents, plants]) => {
        if (cancelled) return;
        setRows({ tents, plants });
      })
      .catch(() => {
        if (cancelled) return;
        setRows({ tents: [], plants: [] });
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, user?.id]);

  const items = useMemo(
    () =>
      buildGlobalSearchItems({
        grows,
        tents: rows.tents,
        plants: rows.plants,
        cultivars: VERDANT_CULTIVARS,
      }),
    [grows, rows.plants, rows.tents],
  );

  return {
    items,
    loading: enabled && (growsLoading || loading),
    error: Boolean(growsError || error),
  };
}
