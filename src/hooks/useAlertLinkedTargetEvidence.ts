/**
 * Read-only lookup of tent/plant ids from linked alert evidence.
 *
 * When an alert row has null tent_id and plant_id, originating timeline
 * refs (sensor_snapshot / diary_entry) are resolved against RLS-scoped
 * sensor_readings, diary_entries, and grow_events. No writes. No
 * Action Queue. Fail-closed on read error.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adaptOriginatingTimelineEventsFromRow } from "@/lib/originatingTimelineEventAdapter";
import {
  linkedEvidenceForRefIds,
  linkedEvidenceLookupIds,
  mergeLinkedEvidenceLookupRow,
  trimAlertTargetId,
  type LinkedAlertTargetEvidence,
} from "@/lib/alertTargetContextRules";

export type AlertLinkedTargetEvidenceStatus = "idle" | "loading" | "ok" | "unavailable";

export interface UseAlertLinkedTargetEvidenceState {
  evidenceByAlertId: ReadonlyMap<string, LinkedAlertTargetEvidence[]>;
  status: AlertLinkedTargetEvidenceStatus;
  /** True while a needed snapshot/diary lookup has not settled. */
  idsLoading: boolean;
}

type AlertEvidenceRow = {
  id: string;
  tent_id?: string | null;
  plant_id?: string | null;
  originating_timeline_events?: unknown;
};

function needsLinkedLookup(alert: AlertEvidenceRow): boolean {
  return !trimAlertTargetId(alert.tent_id) || !trimAlertTargetId(alert.plant_id);
}

function asEvidence(row: {
  id?: unknown;
  tent_id?: unknown;
  plant_id?: unknown;
}): { id: string; tentId: string | null; plantId: string | null } | null {
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!id) return null;
  return {
    id,
    tentId: typeof row.tent_id === "string" ? row.tent_id : null,
    plantId: typeof row.plant_id === "string" ? row.plant_id : null,
  };
}

export function useAlertLinkedTargetEvidence(
  alerts: readonly AlertEvidenceRow[],
): UseAlertLinkedTargetEvidenceState {
  const [evidenceByAlertId, setEvidenceByAlertId] = useState<
    ReadonlyMap<string, LinkedAlertTargetEvidence[]>
  >(() => new Map());
  const [status, setStatus] = useState<AlertLinkedTargetEvidenceStatus>("idle");

  const lookupPlan = useMemo(() => {
    const perAlert: Array<{ alertId: string; lookupIds: string[] }> = [];
    const allIds = new Set<string>();
    for (const alert of alerts) {
      if (!needsLinkedLookup(alert)) continue;
      const refs = adaptOriginatingTimelineEventsFromRow(alert);
      const lookupIds = linkedEvidenceLookupIds(refs);
      if (lookupIds.length === 0) continue;
      perAlert.push({ alertId: alert.id, lookupIds });
      for (const id of lookupIds) allIds.add(id);
    }
    return {
      perAlert,
      ids: Array.from(allIds).sort(),
    };
  }, [alerts]);

  const lookupKey = lookupPlan.perAlert
    .map((item) => `${item.alertId}:${item.lookupIds.join(",")}`)
    .join("|");

  useEffect(() => {
    let cancelled = false;
    const ids = lookupKey
      ? Array.from(
          new Set(
            lookupKey.split("|").flatMap((part) => {
              const idsPart = part.split(":")[1] ?? "";
              return idsPart ? idsPart.split(",") : [];
            }),
          ),
        ).filter(Boolean)
      : [];
    const perAlert = lookupKey
      ? lookupKey.split("|").map((part) => {
          const [alertId, idsPart] = part.split(":");
          return { alertId, lookupIds: idsPart ? idsPart.split(",") : [] };
        })
      : [];
    if (ids.length === 0) {
      setEvidenceByAlertId(new Map());
      setStatus("ok");
      return;
    }
    setStatus("loading");
    void Promise.all([
      supabase.from("sensor_readings").select("id,tent_id").in("id", ids),
      supabase.from("diary_entries").select("id,tent_id,plant_id").in("id", ids),
      supabase.from("grow_events").select("id,tent_id,plant_id,is_deleted").in("id", ids),
    ])
      .then(([readingsRes, diaryRes, eventsRes]) => {
        if (cancelled) return;
        if (readingsRes.error || diaryRes.error || eventsRes.error) {
          setEvidenceByAlertId(new Map());
          setStatus("unavailable");
          return;
        }
        const rowsById = new Map<string, LinkedAlertTargetEvidence>();
        const ingest = (rows: unknown) => {
          if (!Array.isArray(rows)) return;
          for (const raw of rows) {
            const parsed = asEvidence(
              raw as { id?: unknown; tent_id?: unknown; plant_id?: unknown },
            );
            if (!parsed) continue;
            if ((raw as { is_deleted?: unknown }).is_deleted === true) continue;
            rowsById.set(parsed.id, mergeLinkedEvidenceLookupRow(rowsById.get(parsed.id), parsed));
          }
        };
        ingest(readingsRes.data);
        ingest(diaryRes.data);
        ingest(eventsRes.data);

        const next = new Map<string, LinkedAlertTargetEvidence[]>();
        for (const item of perAlert) {
          next.set(item.alertId, linkedEvidenceForRefIds(item.lookupIds, rowsById));
        }
        setEvidenceByAlertId(next);
        setStatus("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setEvidenceByAlertId(new Map());
        setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [lookupKey]);

  const idsLoading = lookupPlan.ids.length > 0 && status !== "ok" && status !== "unavailable";

  return { evidenceByAlertId, status, idsLoading };
}
