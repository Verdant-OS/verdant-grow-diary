import type { QueryClient } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { clearGrowDataMeta } from "@/hooks/useGrowData";
import { clearGlobalSearchPrivateState } from "@/lib/globalSearchSession";

/**
 * Clear all private client state before AuthProvider publishes a resolved or
 * changed identity. The synchronous search reset moves mounted observers off
 * their old raw term before QueryClient is cleared, preventing an active
 * observer from recreating the previous owner's cache key.
 */
export function clearPrivateClientStateBeforeAuthIdentityChange(
  queryClient: Pick<QueryClient, "clear">,
): void {
  flushSync(() => clearGlobalSearchPrivateState());
  queryClient.clear();
  clearGrowDataMeta();
}
