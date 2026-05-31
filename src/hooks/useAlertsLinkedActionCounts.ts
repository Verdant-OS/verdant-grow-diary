/**
 * useAlertsLinkedActionCounts — read-only hook returning a per-alert summary
 * of open (non-terminal) action_queue rows that reference the visible alert
 * ids via the `[alert:<id>]` back-pointer.
 *
 * Safety:
 *  - SELECT only. No insert/update/delete/upsert/rpc/functions.invoke.
 *  - RLS enforces ownership; no service_role.
 *  - Never exposes raw tokens — counts/ids only.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildAlertsLinkedActionsViewModel,
  type AlertLinkedActionsSummary,
} from "@/lib/alertsLinkedActionsViewModel";

type CountsMap = Map<string, AlertLinkedActionsSummary>;

const OPEN_STATUSES = ["pending_approval", "approved", "simulated"] as const;

export function useAlertsLinkedActionCounts(
  alertIds: ReadonlyArray<string>,
): CountsMap {
  const [counts, setCounts] = useState<CountsMap>(new Map());
  // Stable dependency for the effect: join the sorted, de-duped ids.
  const idKey = Array.from(new Set(alertIds)).sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = idKey ? idKey.split(",") : [];
    if (ids.length === 0) {
      setCounts(new Map());
      return;
    }
    (async () => {
      // Read all open action_queue rows in scope; filtering by alert id is
      // done client-side via the pure view-model helper (token parsing is
      // not expressible as a single SQL filter for many ids).
      const { data, error } = await supabase
        .from("action_queue")
        .select("id,reason,status")
        .in("status", OPEN_STATUSES as unknown as string[])
        .limit(1000);
      if (cancelled) return;
      if (error) {
        setCounts(new Map());
        return;
      }
      setCounts(
        buildAlertsLinkedActionsViewModel(
          (data ?? []) as Array<{
            id: string;
            reason: string | null;
            status: string | null;
          }>,
          ids,
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  return counts;
}
