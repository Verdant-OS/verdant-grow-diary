/**
 * Read-only name lookup for alert tent/plant target labels.
 *
 * RLS-scoped selects of id + name only (tents also read grow_id so a
 * grow with exactly one tent can be used as a display fallback). No
 * writes. Fail-closed: a read error yields empty maps so the presenter
 * shows unavailable copy rather than inventing names.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeAlertTargetLabel } from "@/lib/alertTargetContextRules";
import { pickSoleLoadedId } from "@/lib/oneTentLoopHandoffIds";

export type AlertTargetNamesStatus = "idle" | "loading" | "ok" | "unavailable";

export interface UseAlertTargetNamesState {
  tentNameById: ReadonlyMap<string, string>;
  plantNameById: ReadonlyMap<string, string>;
  /** Grow id → tent id when that grow has exactly one non-archived tent. */
  singleTentIdByGrowId: ReadonlyMap<string, string>;
  status: AlertTargetNamesStatus;
}

function toNameMap(rows: ReadonlyArray<{ id: string; name: string }> | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows ?? []) {
    const label = sanitizeAlertTargetLabel(row.name);
    if (!label) continue;
    if (typeof row.id !== "string" || row.id.trim().length === 0) continue;
    map.set(row.id, label);
  }
  return map;
}

function toSingleTentIdByGrowId(
  rows: ReadonlyArray<{ id: string; grow_id?: string | null }> | null,
): Map<string, string> {
  const byGrow = new Map<string, string[]>();
  for (const row of rows ?? []) {
    if (typeof row.id !== "string" || !row.id.trim()) continue;
    const growId = typeof row.grow_id === "string" ? row.grow_id.trim() : "";
    if (!growId) continue;
    const list = byGrow.get(growId) ?? [];
    list.push(row.id.trim());
    byGrow.set(growId, list);
  }
  const out = new Map<string, string>();
  for (const [growId, tentIds] of byGrow) {
    const sole = pickSoleLoadedId(tentIds);
    if (sole) out.set(growId, sole);
  }
  return out;
}

export function useAlertTargetNames(): UseAlertTargetNamesState {
  const [tentNameById, setTentNameById] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [plantNameById, setPlantNameById] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [singleTentIdByGrowId, setSingleTentIdByGrowId] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [status, setStatus] = useState<AlertTargetNamesStatus>("idle");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void Promise.all([
      supabase.from("tents").select("id,name,grow_id").eq("is_archived", false),
      supabase.from("plants").select("id,name").eq("is_archived", false),
    ])
      .then(([tentsRes, plantsRes]) => {
        if (cancelled) return;
        if (tentsRes.error || plantsRes.error) {
          setTentNameById(new Map());
          setPlantNameById(new Map());
          setSingleTentIdByGrowId(new Map());
          setStatus("unavailable");
          return;
        }
        const tentRows = tentsRes.data as Array<{
          id: string;
          name: string;
          grow_id?: string | null;
        }> | null;
        setTentNameById(toNameMap(tentRows));
        setPlantNameById(toNameMap(plantsRes.data as Array<{ id: string; name: string }> | null));
        setSingleTentIdByGrowId(toSingleTentIdByGrowId(tentRows));
        setStatus("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setTentNameById(new Map());
        setPlantNameById(new Map());
        setSingleTentIdByGrowId(new Map());
        setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { tentNameById, plantNameById, singleTentIdByGrowId, status };
}
