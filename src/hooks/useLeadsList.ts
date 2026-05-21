import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveCaller, hasRole, type Caller } from "@/lib/permissions";

export interface LeadRow {
  id: string;
  created_at: string;
  name: string | null;
  email: string;
  company: string | null;
  role: string | null;
  lead_type: string;
  source: string;
  message: string | null;
}

export interface UseLeadsListResult {
  loading: boolean;
  authorized: boolean;
  error: string | null;
  leads: LeadRow[];
  reload: () => void;
}

export interface UseLeadsListOptions {
  leadType?: string | null;
  source?: string | null;
}

/**
 * Operator-only lead inbox query.
 *
 * Reads only public.leads. RLS restricts SELECT to operators, so non-operator
 * callers will get an empty result. We also short-circuit on the client when
 * we can detect the caller is not an operator, to render a clear unauthorized
 * state instead of a misleading "no leads yet".
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
        .select("id, created_at, name, email, company, role, lead_type, source, message")
        .order("created_at", { ascending: false });
      if (opts.leadType) q = q.eq("lead_type", opts.leadType);
      if (opts.source) q = q.eq("source", opts.source);
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
  }, [opts.leadType, opts.source, nonce]);

  return {
    loading,
    authorized,
    error,
    leads,
    reload: () => setNonce((n) => n + 1),
  };
}
