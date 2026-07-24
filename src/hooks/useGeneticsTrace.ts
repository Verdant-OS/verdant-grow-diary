/**
 * Trace + per-subject evidence read hooks. The trace query returns the shaped
 * presenter view (buildTraceView) so components stay presenter-only.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/store/auth";
import {
  resolveTrace,
  listScreeningForSubject,
  listQuarantineForSubject,
  type ScreeningDto,
  type QuarantineEpisodeDto,
} from "@/lib/genetics/traceabilityApi";
import { buildTraceView, type TraceView } from "@/lib/genetics/traceabilityViewModel";

export type TraceDirection = "ancestors" | "descendants" | "both";

export function traceQueryKey(
  ownerId: string | null,
  subjectType: string,
  subjectId: string,
  direction: TraceDirection,
) {
  return ["genetics", "trace", ownerId ?? "anon", subjectType, subjectId, direction] as const;
}

export function useGeneticsTrace(
  subjectType: string | null,
  subjectId: string | null,
  direction: TraceDirection = "both",
): { view: TraceView; isLoading: boolean; isError: boolean; refetch: () => void } {
  const ownerId = useAuth().user?.id ?? null;
  const enabled = !!ownerId && !!subjectType && !!subjectId;
  const query = useQuery({
    queryKey: traceQueryKey(ownerId, subjectType ?? "", subjectId ?? "", direction),
    enabled,
    retry: false,
    queryFn: () => resolveTrace(subjectType!, subjectId!, direction),
  });
  const view = useMemo(() => buildTraceView(query.data), [query.data]);
  return {
    view,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
    },
  };
}

export function screeningQueryKey(ownerId: string | null, subjectType: string, subjectId: string) {
  return ["genetics", "screening", ownerId ?? "anon", subjectType, subjectId] as const;
}

export function useSubjectScreening(subjectType: string | null, subjectId: string | null) {
  const ownerId = useAuth().user?.id ?? null;
  return useQuery<ScreeningDto[]>({
    queryKey: screeningQueryKey(ownerId, subjectType ?? "", subjectId ?? ""),
    enabled: !!ownerId && !!subjectType && !!subjectId,
    retry: false,
    queryFn: () => listScreeningForSubject(subjectType!, subjectId!),
  });
}

export function quarantineQueryKey(ownerId: string | null, subjectType: string, subjectId: string) {
  return ["genetics", "quarantine", ownerId ?? "anon", subjectType, subjectId] as const;
}

export function useSubjectQuarantine(subjectType: string | null, subjectId: string | null) {
  const ownerId = useAuth().user?.id ?? null;
  return useQuery<QuarantineEpisodeDto[]>({
    queryKey: quarantineQueryKey(ownerId, subjectType ?? "", subjectId ?? ""),
    enabled: !!ownerId && !!subjectType && !!subjectId,
    retry: false,
    queryFn: () => listQuarantineForSubject(subjectType!, subjectId!),
  });
}
