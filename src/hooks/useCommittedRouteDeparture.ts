import { useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import { selectCommittedLocation } from "@/lib/routerCommittedLocation";

/**
 * A request may retain this subscription through its component's temporary
 * unmount. The request must unsubscribe when it finishes. Attempted or redirected
 * navigation does not abandon the request until a different location resolves.
 */
export function useCommittedRouteDeparture() {
  const router = useRouter({ warn: false });
  return useCallback(
    (onDeparture: () => void): (() => void) => {
      if (router) {
        const startingHref = selectCommittedLocation(router.state).href;
        return router.subscribe("onResolved", ({ toLocation }) => {
          if (toLocation.href !== startingHref) onDeparture();
        });
      }
      // Non-TanStack hosts can observe only committed browser URL changes.
      const startingHref = window.location.href;
      const onBrowserNavigation = () => {
        if (window.location.href !== startingHref) onDeparture();
      };
      window.addEventListener("popstate", onBrowserNavigation);
      window.addEventListener("hashchange", onBrowserNavigation);
      return () => {
        window.removeEventListener("popstate", onBrowserNavigation);
        window.removeEventListener("hashchange", onBrowserNavigation);
      };
    },
    [router],
  );
}
