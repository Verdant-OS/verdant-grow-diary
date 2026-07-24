/**
 * Read hooks for the Genetics Library (accessions + propagation batches).
 * Owner-scoped react-query keys; retry disabled so an RLS-empty result is not
 * retried as a transient error.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import {
  listAccessions,
  listBatches,
  type AccessionDto,
  type BatchDto,
} from "@/lib/genetics/traceabilityApi";

export function accessionsQueryKey(ownerId: string | null, includeArchived: boolean) {
  return ["genetics", "accessions", ownerId ?? "anon", includeArchived] as const;
}

export function batchesQueryKey(ownerId: string | null) {
  return ["genetics", "batches", ownerId ?? "anon"] as const;
}

export function useAccessions(includeArchived = false): UseQueryResult<AccessionDto[]> {
  const ownerId = useAuth().user?.id ?? null;
  return useQuery({
    queryKey: accessionsQueryKey(ownerId, includeArchived),
    enabled: !!ownerId,
    retry: false,
    queryFn: () => listAccessions(includeArchived),
  });
}

export function useBatches(): UseQueryResult<BatchDto[]> {
  const ownerId = useAuth().user?.id ?? null;
  return useQuery({
    queryKey: batchesQueryKey(ownerId),
    enabled: !!ownerId,
    retry: false,
    queryFn: () => listBatches(),
  });
}
