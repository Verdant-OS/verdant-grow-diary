import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import { readCheckoutReturnNavigationSurface } from "@/lib/checkoutReturnTo";

/**
 * Records a paid-return completion only after React Router has mounted the
 * destination location. The one-shot history marker contains a closed surface
 * enum and no route, query, hash, or grower identifiers.
 */
export function useCheckoutReturnCompletionTracking(enabled = true): void {
  const location = useLocation();
  const navigate = useNavigate();
  const consumedStateRef = useRef<unknown>(null);

  useEffect(() => {
    if (!enabled) return;
    const surface = readCheckoutReturnNavigationSurface(location.state);
    if (!surface) return;
    if (consumedStateRef.current === location.state) return;
    consumedStateRef.current = location.state;

    trackFunnelEvent("checkout_return_completed", { surface });
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      { replace: true, state: null },
    );
  }, [enabled, location.hash, location.pathname, location.search, location.state, navigate]);
}
