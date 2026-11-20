import { useEffect } from "react";
import { useAuth } from "@/store/auth";
import { isExcludedAnalyticsPath } from "@/lib/posthogAnalyticsRules";
import { reportFirstPaidActivation } from "@/lib/firstPaidAnalyticsService";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";

export function useFirstPaidAnalytics(pathname: string, consentSince: number | null): void {
  const { user, loading } = useAuth();
  const accountId = user?.id;
  const eligible = consentSince !== null && !isExcludedAnalyticsPath(pathname);
  useEffect(() => {
    if (!eligible || loading || !accountId) return;
    const controller = new AbortController();
    let running = false;
    let checkAgain = false;
    let reported = false;

    // A webhook can land while the sign-in lookup is still in flight. Keep the checkout wake-up.
    const check = async () => {
      if (reported || controller.signal.aborted) return;
      if (running) {
        checkAgain = true;
        return;
      }
      running = true;
      do {
        checkAgain = false;
        reported = await reportFirstPaidActivation(accountId, controller.signal);
      } while (checkAgain && !reported && !controller.signal.aborted);
      running = false;
    };
    const onFunnel = (event: Event) => {
      // This client event only asks for another server read. Its properties never reach PostHog.
      if ((event as CustomEvent).detail?.name === "subscription_activated") void check();
    };
    void check();
    window.addEventListener(PRICING_ANALYTICS_EVENT, onFunnel);
    window.addEventListener("focus", check);
    return () => {
      controller.abort();
      window.removeEventListener(PRICING_ANALYTICS_EVENT, onFunnel);
      window.removeEventListener("focus", check);
    };
  }, [accountId, loading, eligible, consentSince]);
}
