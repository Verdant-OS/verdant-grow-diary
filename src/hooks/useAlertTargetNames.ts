/**
 * Read-only name lookup for alert tent/plant target labels.
 *
 * RLS-scoped selects of id + name + is_archived (tents also read grow_id so
 * a grow with exactly one non-archived tent can be used as a display
 * fallback). Archived rows are read so an alert on an archived tent or
 * plant keeps its historical name; the sole-tent fallback still counts
 * non-archived tents only. Each read asks for an exact count so a capped
 * (truncated) response is detectable; only a complete read may report an
 * id as missing. No writes. Fail-closed: a read error yields
 * empty maps so the presenter shows unavailable copy rather than inventing
 * names.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  sanitizeAlertTargetLabel,
  type AlertTargetRecordState,
} from "@/lib/alertTargetContextRules";
import { pickSoleLoadedId } from "@/lib/oneTentLoopHandoffIds";

export type AlertTargetNamesStatus = "idle" | "loading" | "ok" | "unavailable";

export interface UseAlertTargetNamesState {
  tentNameById: ReadonlyMap<string, string>;
  plantNameById: ReadonlyMap<string, string>;
  /** Every readable tent id (named or not) → active / archived. */
  tentStateById: ReadonlyMap<string, AlertTargetRecordState>;
  /** Every readable plant id (named or not) → active / archived. */
  plantStateById: ReadonlyMap<string, AlertTargetRecordState>;
  /** Grow id → tent id when that grow has exactly one non-archived tent. */
  singleTentIdByGrowId: ReadonlyMap<string, string>;
  status: AlertTargetNamesStatus;
  /**
   * True only when both reads returned every row the count reported, so an
   * id absent from the state maps really was not returned. False while
   * loading, after an error, or when the server capped a response.
   */
  readComplete: boolean;
}

function isCompleteRead(res: { data: unknown; count?: number | null }): boolean {
  const rows = Array.isArray(res.data) ? res.data.length : 0;
  return typeof res.count === "number" && rows >= res.count;
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

type TargetRow = { id: string; name: string; is_archived?: boolean | null };

function isArchivedRow(row: { is_archived?: boolean | null }): boolean {
  return row.is_archived === true;
}

function toStateMap(rows: ReadonlyArray<TargetRow> | null): Map<string, AlertTargetRecordState> {
  const map = new Map<string, AlertTargetRecordState>();
  for (const row of rows ?? []) {
    if (typeof row.id !== "string" || row.id.trim().length === 0) continue;
    map.set(row.id, isArchivedRow(row) ? "archived" : "active");
  }
  return map;
}

function toSingleTentIdByGrowId(
  rows: ReadonlyArray<{ id: string; grow_id?: string | null; is_archived?: boolean | null }> | null,
): Map<string, string> {
  const byGrow = new Map<string, string[]>();
  for (const row of rows ?? []) {
    if (typeof row.id !== "string" || !row.id.trim()) continue;
    if (isArchivedRow(row)) continue;
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
  const [tentStateById, setTentStateById] = useState<ReadonlyMap<string, AlertTargetRecordState>>(
    () => new Map(),
  );
  const [plantStateById, setPlantStateById] = useState<ReadonlyMap<string, AlertTargetRecordState>>(
    () => new Map(),
  );
  const [singleTentIdByGrowId, setSingleTentIdByGrowId] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [status, setStatus] = useState<AlertTargetNamesStatus>("idle");
  const [readComplete, setReadComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setReadComplete(false);
    void Promise.all([
      supabase.from("tents").select("id,name,grow_id,is_archived", { count: "exact" }),
      supabase.from("plants").select("id,name,is_archived", { count: "exact" }),
    ])
      .then(([tentsRes, plantsRes]) => {
        if (cancelled) return;
        if (tentsRes.error || plantsRes.error) {
          setTentNameById(new Map());
          setPlantNameById(new Map());
          setTentStateById(new Map());
          setPlantStateById(new Map());
          setSingleTentIdByGrowId(new Map());
          setStatus("unavailable");
          return;
        }
        const tentRows = tentsRes.data as Array<TargetRow & { grow_id?: string | null }> | null;
        const plantRows = plantsRes.data as Array<TargetRow> | null;
        setTentNameById(toNameMap(tentRows));
        setPlantNameById(toNameMap(plantRows));
        setTentStateById(toStateMap(tentRows));
        setPlantStateById(toStateMap(plantRows));
        const tentReadComplete = isCompleteRead(tentsRes);
        // "Exactly one active tent" is only knowable from every tent row; a
        // capped list could hold one of several and mislabel an alert.
        setSingleTentIdByGrowId(tentReadComplete ? toSingleTentIdByGrowId(tentRows) : new Map());
        setReadComplete(tentReadComplete && isCompleteRead(plantsRes));
        setStatus("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setTentNameById(new Map());
        setPlantNameById(new Map());
        setTentStateById(new Map());
        setPlantStateById(new Map());
        setSingleTentIdByGrowId(new Map());
        setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    tentNameById,
    plantNameById,
    tentStateById,
    plantStateById,
    singleTentIdByGrowId,
    status,
    readComplete,
  };
}
