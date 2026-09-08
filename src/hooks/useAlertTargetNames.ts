/**
 * Read-only name lookup for alert tent/plant target labels.
 *
 * RLS-scoped selects of id + name only. No writes. Fail-closed: a read
 * error yields empty maps so the presenter shows unavailable copy rather
 * than inventing names.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeAlertTargetLabel } from "@/lib/alertTargetContextRules";

export type AlertTargetNamesStatus = "idle" | "loading" | "ok" | "unavailable";

export interface UseAlertTargetNamesState {
  tentNameById: ReadonlyMap<string, string>;
  plantNameById: ReadonlyMap<string, string>;
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

export function useAlertTargetNames(): UseAlertTargetNamesState {
  const [tentNameById, setTentNameById] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [plantNameById, setPlantNameById] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [status, setStatus] = useState<AlertTargetNamesStatus>("idle");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void Promise.all([
      supabase.from("tents").select("id,name").eq("is_archived", false),
      supabase.from("plants").select("id,name").eq("is_archived", false),
    ])
      .then(([tentsRes, plantsRes]) => {
        if (cancelled) return;
        if (tentsRes.error || plantsRes.error) {
          setTentNameById(new Map());
          setPlantNameById(new Map());
          setStatus("unavailable");
          return;
        }
        setTentNameById(toNameMap(tentsRes.data as Array<{ id: string; name: string }> | null));
        setPlantNameById(toNameMap(plantsRes.data as Array<{ id: string; name: string }> | null));
        setStatus("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setTentNameById(new Map());
        setPlantNameById(new Map());
        setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { tentNameById, plantNameById, status };
}
