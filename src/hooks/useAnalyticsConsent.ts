import { useCallback, useEffect, useState } from "react";
import {
  readAnalyticsConsent,
  subscribeToAnalyticsConsent,
  writeAnalyticsConsent,
  type AnalyticsConsentDecision,
} from "@/lib/analyticsConsent";

/**
 * Reads the analytics consent decision reactively.
 *
 * Starts as "unset" on the server and on the first client render so hydration
 * matches; the stored decision is applied in an effect.
 */
export function useAnalyticsConsent() {
  const [decision, setDecision] = useState<AnalyticsConsentDecision>("unset");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDecision(readAnalyticsConsent());
    setHydrated(true);
    return subscribeToAnalyticsConsent(() => setDecision(readAnalyticsConsent()));
  }, []);

  const accept = useCallback(() => writeAnalyticsConsent("granted"), []);
  const decline = useCallback(() => writeAnalyticsConsent("denied"), []);

  return { decision, hydrated, accept, decline };
}
