/**
 * Read-only hook: recent AI Doctor session snapshots for a single plant.
 *
 * Queries `ai_doctor_sessions` scoped to the supplied plant_id.
 * Newest first. Limited to the latest 10 sessions.
 *
 * Safety envelope:
 *   - No writes. No queue mutations. No alerts. No automation.
 *   - RLS enforces row ownership via auth.uid() — client key only.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import type { DiagnosisSuggestedAction } from "@/lib/aiDoctorDiagnosisRules";
import type { AiContextConfidenceCeiling } from "@/lib/aiContextSufficiencyRules";

export const AI_DOCTOR_SESSIONS_LIMIT = 10;
export const AI_DOCTOR_SESSIONS_COACH_LIMIT = 5;
export const AI_DOCTOR_SESSIONS_INDEX_PAGE_SIZE = 25;

export interface AiDoctorSessionRow {
  id: string;
  created_at: string;
  plant_id: string | null;
  tent_id?: string | null;
  grow_id: string | null;
  question: string | null;
  diagnosis: Diagnosis | null;
  raw_confidence: number | null;
  displayed_confidence: number | null;
  context_confidence_ceiling: AiContextConfidenceCeiling | null;
  suggested_actions: DiagnosisSuggestedAction[];
}

const SESSION_SELECT =
  "id,created_at,plant_id,tent_id,grow_id,question,diagnosis,raw_confidence,displayed_confidence,context_confidence_ceiling,suggested_actions";

export function useAiDoctorSessions(plantId: string | null | undefined) {
  return useQuery({
    queryKey: ["ai_doctor_sessions", plantId ?? null],
    enabled: !!plantId,
    queryFn: async (): Promise<AiDoctorSessionRow[]> => {
      const { data, error } = await supabase
        .from("ai_doctor_sessions" as never)
        .select(SESSION_SELECT)
        .eq("plant_id", plantId as string)
        .order("created_at", { ascending: false })
        .limit(AI_DOCTOR_SESSIONS_LIMIT);
      if (error) throw error;
      return (data ?? []) as AiDoctorSessionRow[];
    },
  });
}

export function useTentAiDoctorSessions(tentId: string | null | undefined) {
  return useQuery({
    queryKey: ["ai_doctor_sessions", "tent", tentId ?? null],
    enabled: !!tentId,
    queryFn: async (): Promise<AiDoctorSessionRow[]> => {
      const { data, error } = await supabase
        .from("ai_doctor_sessions" as never)
        .select(SESSION_SELECT)
        .eq("tent_id", tentId as string)
        .order("created_at", { ascending: false })
        .limit(AI_DOCTOR_SESSIONS_LIMIT);
      if (error) throw error;
      return (data ?? []) as AiDoctorSessionRow[];
    },
  });
}

export function useAiDoctorSession(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ["ai_doctor_sessions", "detail", sessionId ?? null],
    enabled: !!sessionId,
    queryFn: async (): Promise<AiDoctorSessionRow | null> => {
      const { data, error } = await supabase
        .from("ai_doctor_sessions" as never)
        .select(SESSION_SELECT)
        .eq("id", sessionId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AiDoctorSessionRow | null;
    },
  });
}


export function useGrowAiDoctorSessions(growId: string | null | undefined) {
  return useQuery({
    queryKey: ["ai_doctor_sessions", "grow", growId ?? null],
    enabled: !!growId,
    queryFn: async (): Promise<AiDoctorSessionRow[]> => {
      const { data, error } = await supabase
        .from("ai_doctor_sessions" as never)
        .select(SESSION_SELECT)
        .eq("grow_id", growId as string)
        .order("created_at", { ascending: false })
        .limit(AI_DOCTOR_SESSIONS_COACH_LIMIT);
      if (error) throw error;
      return (data ?? []) as AiDoctorSessionRow[];
    },
  });
}

export interface AiDoctorSessionsIndexPage {
  rows: AiDoctorSessionRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

import {
  DEFAULT_FILTERS,
  dateRangeSince,
  type SessionsIndexFilters,
} from "@/lib/aiDoctorSessionsIndexFilters";

export function useAiDoctorSessionsIndex(
  page: number = 0,
  filters: SessionsIndexFilters = DEFAULT_FILTERS,
) {
  const pageSize = AI_DOCTOR_SESSIONS_INDEX_PAGE_SIZE;
  const safePage = Number.isFinite(page) && page >= 0 ? Math.floor(page) : 0;
  const from = safePage * pageSize;
  // Fetch one extra row to detect "hasMore" without a count query.
  const to = from + pageSize;
  return useQuery({
    queryKey: [
      "ai_doctor_sessions",
      "index",
      safePage,
      pageSize,
      filters.risk,
      filters.hasActions,
      filters.dateRange,
    ],
    queryFn: async (): Promise<AiDoctorSessionsIndexPage> => {
      let q = supabase
        .from("ai_doctor_sessions" as never)
        .select(SESSION_SELECT);

      if (filters.risk !== "all") {
        q = q.eq("diagnosis->>riskLevel", filters.risk);
      }
      if (filters.hasActions === "yes") {
        q = q.not("suggested_actions", "eq", "[]");
      } else if (filters.hasActions === "no") {
        q = q.eq("suggested_actions", "[]");
      }
      const since = dateRangeSince(filters.dateRange);
      if (since) {
        q = q.gte("created_at", since.toISOString());
      }

      const { data, error } = await q
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      const all = (data ?? []) as AiDoctorSessionRow[];
      const hasMore = all.length > pageSize;
      return {
        rows: hasMore ? all.slice(0, pageSize) : all,
        page: safePage,
        pageSize,
        hasMore,
      };
    },
  });
}


