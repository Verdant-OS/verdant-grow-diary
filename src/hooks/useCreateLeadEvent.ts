import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { LeadEventType } from "@/lib/leadEventRules";

export interface CreateLeadEventInput {
  leadId: string;
  eventType: LeadEventType;
  note?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
}

/**
 * Operator-only insert into public.lead_events.
 *
 * RLS enforces: operator role required, actor_user_id = auth.uid().
 * History remains append-only — this hook never updates or deletes events.
 */
export function useCreateLeadEvent() {
  const [submitting, setSubmitting] = useState(false);

  const createEvent = useCallback(
    async (input: CreateLeadEventInput): Promise<{ error: string | null }> => {
      setSubmitting(true);
      try {
        const { data: userRes, error: authErr } = await supabase.auth.getUser();
        if (authErr || !userRes?.user) {
          return { error: authErr?.message ?? "Not authenticated" };
        }
        const { error } = await supabase.from("lead_events").insert({
          lead_id: input.leadId,
          actor_user_id: userRes.user.id,
          event_type: input.eventType,
          note: input.note ?? null,
          old_status: input.oldStatus ?? null,
          new_status: input.newStatus ?? null,
        });
        if (error) return { error: error.message };
        return { error: null };
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  return { createEvent, submitting };
}
