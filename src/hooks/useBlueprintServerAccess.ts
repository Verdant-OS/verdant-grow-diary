import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBlueprintAccess } from "@/lib/blueprintAccess.functions";

/**
 * Server verdict for the Blueprint overlay. Runs only when `enabled` (the
 * client already believes the viewer may be entitled). Anything other than
 * a confirmed `allowed: true` from the server keeps Blueprint locked.
 */
export interface BlueprintServerAccess {
  allowed: boolean;
  pending: boolean;
}

export function useBlueprintServerAccess(
  enabled: boolean,
  planKey: string,
): BlueprintServerAccess {
  const fetchBlueprintAccess = useServerFn(getBlueprintAccess);
  const query = useQuery({
    queryKey: ["blueprint-access", planKey],
    queryFn: () => fetchBlueprintAccess(),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
  // A failed recheck keeps the last data in the cache, so require a successful
  // query state too: an expired token or outage after an earlier allow locks.
  return {
    allowed: enabled && query.isSuccess && query.data?.allowed === true,
    pending: enabled && query.isPending,
  };
}
