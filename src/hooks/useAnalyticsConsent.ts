import { useCallback, useEffect, useState } from "react";
import {
  readAnalyticsConsent,
  subscribeToAnalyticsConsent,
  writeAnalyticsConsent,
  type AnalyticsConsentDecision,
} from "@/lib/analyticsConsent";
import {
  FIRST_PAID_CONSENT_KEY,
  readPaidAnalyticsSince,
  recordPaidAnalyticsChoice,
} from "@/lib/firstPaidAnalyticsService";

/**
 * Reads the analytics consent decision reactively.
 *
 * Starts as "unset" on the server and on the first client render so hydration
 * matches; the stored decision is applied in an effect.
 */
export function useAnalyticsConsent() {
  const [decision, setDecision] = useState<AnalyticsConsentDecision>("unset");
  const [paidSince, setPaidSince] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => {
      setDecision(readAnalyticsConsent());
      setPaidSince(readPaidAnalyticsSince());
    };
    sync();
    setHydrated(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === FIRST_PAID_CONSENT_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    const unsubscribe = subscribeToAnalyticsConsent(sync);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const accept = useCallback(() => {
    recordPaidAnalyticsChoice("granted");
    writeAnalyticsConsent("granted");
  }, []);
  const decline = useCallback(() => {
    recordPaidAnalyticsChoice("denied");
    writeAnalyticsConsent("denied");
  }, []);

  return { decision, paidSince, hydrated, accept, decline };
}
