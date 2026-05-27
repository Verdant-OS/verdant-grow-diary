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

export interface AiDoctorSessionRow {
  id: string;
  created_at: string;
  plant_id: string | null;
  grow_id: string | null;
  question: string | null;
  diagnosis: Diagnosis | null;
  raw_confidence: number | null;
  displayed_confidence: number | null;
  context_confidence_ceiling: AiContextConfidenceCeiling | null;
  suggested_actions: DiagnosisSuggestedAction[];
}

export function useAiDoctorSessions(plantId: string | null | undefined) {
  return useQuery({
    queryKey: ["ai_doctor_sessions", plantId ?? null],
    enabled: !!plantId,
    queryFn: async (): Promise<AiDoctorSessionRow[]> => {
      const { data, error } = await supabase
        .from("ai_doctor_sessions" as never)
        .select(
          "id,created_at,plant_id,grow_id,question,diagnosis,raw_confidence,displayed_confidence,context_confidence_ceiling,suggested_actions",
        )
        .eq("plant_id", plantId as string)
        .order("created_at", { ascending: false })
        .limit(AI_DOCTOR_SESSIONS_LIMIT);
      if (error) throw error;
      return (data ?? []) as AiDoctorSessionRow[];
    },
  });
}
