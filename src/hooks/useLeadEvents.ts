import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LeadEventRow {
  id: string;
  lead_id: string;
  actor_user_id: string;
  event_type: string;
  old_status: string | null;
  new_status: string | null;
  note: string | null;
  created_at: string;
}

/**
 * Fetches activity history for a single lead. Reads only public.lead_events.
 * RLS restricts SELECT to operators.
 */
export function useLeadEvents(leadId: string | null, refreshKey: number = 0) {
  const [events, setEvents] = useState<LeadEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: qErr } = await supabase
        .from("lead_events")
        .select("id, lead_id, actor_user_id, event_type, old_status, new_status, note, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setEvents([]);
      } else {
        setEvents((data ?? []) as LeadEventRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId, refreshKey]);

  return { events, loading, error };
}
