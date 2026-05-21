import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveCaller, hasRole, type Caller } from "@/lib/permissions";

export type LeadStatus =
  | "new"
  | "reviewed"
  | "contacted"
  | "follow_up"
  | "closed"
  | "spam";

export interface LeadRow {
  id: string;
  created_at: string;
  updated_at: string | null;
  name: string | null;
  email: string;
  company: string | null;
  role: string | null;
  lead_type: string;
  source: string;
  message: string | null;
  status: LeadStatus;
  operator_notes: string | null;
  contacted_at: string | null;
  follow_up_at: string | null;
}

export interface UseLeadsListResult {
  loading: boolean;
  authorized: boolean;
  error: string | null;
  leads: LeadRow[];
  reload: () => void;
  updateLead: (
    id: string,
    patch: Partial<
      Pick<
        LeadRow,
        "status" | "operator_notes" | "contacted_at" | "follow_up_at"
      >
    >,
  ) => Promise<{ error: string | null }>;
}

export interface UseLeadsListOptions {
  leadType?: string | null;
  source?: string | null;
  status?: string | null;
}

/**
 * Operator-only lead inbox query.
 *
 * Reads and updates only public.leads. RLS restricts SELECT/UPDATE to
 * operators; non-operator callers see an unauthorized state.
 */
export function useLeadsList(opts: UseLeadsListOptions = {}): UseLeadsListResult {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      let caller: Caller;
      try {
        caller = await resolveCaller();
      } catch {
        if (!cancelled) {
          setAuthorized(false);
          setLeads([]);
          setLoading(false);
        }
        return;
      }
      const isOperator = hasRole(caller, "operator");
      if (!isOperator) {
        if (!cancelled) {
          setAuthorized(false);
          setLeads([]);
          setLoading(false);
        }
        return;
      }
      let q = supabase
        .from("leads")
        .select(
          "id, created_at, updated_at, name, email, company, role, lead_type, source, message, status, operator_notes, contacted_at, follow_up_at",
        )
        .order("created_at", { ascending: false });
      if (opts.leadType) q = q.eq("lead_type", opts.leadType);
      if (opts.source) q = q.eq("source", opts.source);
      if (opts.status) q = q.eq("status", opts.status);
      const { data, error: qErr } = await q;
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setAuthorized(true);
        setLeads([]);
      } else {
        setAuthorized(true);
        setLeads((data ?? []) as LeadRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [opts.leadType, opts.source, opts.status, nonce]);

  const updateLead = useCallback<UseLeadsListResult["updateLead"]>(
    async (id, patch) => {
      // Allow-list: original lead submission fields (name, email, company,
      // role, lead_type, source, message) are immutable from the UI.
      const ALLOWED = [
        "status",
        "operator_notes",
        "contacted_at",
        "follow_up_at",
      ] as const;
      const safePatch: Record<string, unknown> = {};
      for (const k of ALLOWED) {
        if (k in patch) safePatch[k] = (patch as Record<string, unknown>)[k];
      }
      const { data, error: uErr } = await supabase
        .from("leads")
        .update(safePatch)
        .eq("id", id)
        .select(
          "id, created_at, updated_at, name, email, company, role, lead_type, source, message, status, operator_notes, contacted_at, follow_up_at",
        )
        .maybeSingle();
      if (uErr) return { error: uErr.message };
      if (data) {
        setLeads((prev) =>
          prev.map((l) => (l.id === id ? ({ ...l, ...(data as LeadRow) }) : l)),
        );
      }
      return { error: null };
    },
    [],
  );

  return {
    loading,
    authorized,
    error,
    leads,
    reload: () => setNonce((n) => n + 1),
    updateLead,
  };
}
