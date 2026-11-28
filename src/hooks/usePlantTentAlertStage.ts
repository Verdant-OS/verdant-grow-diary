/**
 * usePlantTentAlertStage — the stage a plant's tent's alerts are judged by
 * now, for the staleness note on the plant's Tent Alerts panel.
 *
 * Read-only. It reads the same rows the Alerts page judges alerts with (the
 * grow row from the grows store, the grow's tents, the active plants) so the
 * note compares an open alert with the stage that page would use today, never
 * with one plant's own stage (Reviewer C on #3021, round 3). The decision is
 * the pure resolveTentAlertStageForView; this hook only gathers its inputs.
 *
 * A pending or failed read gives null, and null never shows a note.
 */
import { useMemo } from "react";
import { usePlants } from "@/hooks/use-plants";
import { useGrowTents } from "@/hooks/useGrowData";
import { resolveTentAlertStageForView } from "@/lib/alertSnapshotStageScopeRules";
import { useGrows } from "@/store/grows";

export function usePlantTentAlertStage(
  growId: string | null | undefined,
  tentId: string | null | undefined,
): string | null {
  const { grows } = useGrows();
  const tentsQuery = useGrowTents(growId ?? undefined);
  const plantsQuery = usePlants();

  const growRow = Array.isArray(grows) ? (grows.find((g) => g.id === growId) ?? null) : null;
  const tents = tentsQuery.isError ? null : (tentsQuery.data ?? null);
  const plants = plantsQuery.isError ? null : (plantsQuery.data ?? null);

  return useMemo(
    () =>
      resolveTentAlertStageForView({
        growId,
        growRow: growRow as { stage?: string | null } | null,
        tentId,
        tents,
        plants,
      }),
    [growId, growRow, tentId, tents, plants],
  );
}
