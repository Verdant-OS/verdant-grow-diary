/**
 * Shared identity-transition fence for AuthProvider.
 * Lives outside __root so app / public session shells can reuse it without
 * circular route imports.
 */
import { useRouter } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { clearGrowDataMeta } from "@/hooks/useGrowData";

/**
 * Returns a synchronous callback that clears private React Query cache and
 * grow-data meta before AuthProvider exposes a new user identity.
 */
export function useAuthIdentityFence(): (
  previousUserId: string | null,
  nextUserId: string | null,
) => void {
  const router = useRouter();
  return () => {
    const queryClient = (router.options.context as { queryClient?: QueryClient } | undefined)
      ?.queryClient;
    queryClient?.clear();
    clearGrowDataMeta();
  };
}
