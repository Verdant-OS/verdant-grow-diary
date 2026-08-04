import { useEffect } from "react";
import { Link } from "@/lib/react-router-compat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { setGoogleAnalyticsOptOut } from "@/lib/googleAnalyticsLoader";
import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";
import type { AnalyticsConsentDecision } from "@/lib/analyticsConsent";

/**
 * Grower-facing control for the analytics consent decision.
 *
 * Presentation only: the decision itself lives in localStorage (see
 * src/lib/analyticsConsent.ts) and is never sent anywhere. Revoking here
 * flips GA's own kill switch immediately for this document; page views are
 * already blocked upstream by the consent gate.
 */

const STATUS_COPY: Record<
  AnalyticsConsentDecision,
  { label: string; variant: "default" | "secondary" | "outline"; detail: string }
> = {
  granted: {
    label: "Analytics on",
    variant: "default",
    detail:
      "You accepted analytics. Verdant loads Google Analytics and records which pages you visit.",
  },
  denied: {
    label: "Analytics off",
    variant: "secondary",
    detail:
      "You declined analytics. Nothing analytics-related loads and no page views are recorded.",
  },
  unset: {
    label: "No choice made yet",
    variant: "outline",
    detail:
      "You have not answered the consent prompt yet. Analytics stays off until you accept.",
  },
};

export default function AnalyticsConsentSettings() {
  const { decision, hydrated, accept, decline } = useAnalyticsConsent();

  // Apply the current decision to the live document so a revoke takes effect
  // without a reload.
  useEffect(() => {
    if (!hydrated) return;
    setGoogleAnalyticsOptOut(decision !== "granted");
  }, [decision, hydrated]);

  const status = STATUS_COPY[decision];

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8" data-testid="analytics-consent-settings">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics consent</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Verdant only measures page usage if you say yes. Your grows, diary entries, photos,
        and sensor readings are never sent to analytics.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Current choice</CardTitle>
            {hydrated ? (
              <Badge variant={status.variant} data-testid="analytics-consent-status">
                {status.label}
              </Badge>
            ) : (
              <Badge variant="outline">Checking…</Badge>
            )}
          </div>
          <CardDescription data-testid="analytics-consent-status-detail">
            {hydrated ? status.detail : "Reading your saved choice from this browser…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="min-h-11 flex-1"
              disabled={!hydrated || decision === "granted"}
              data-testid="analytics-consent-settings-grant"
              onClick={accept}
            >
              {decision === "granted" ? "Analytics allowed" : "Allow analytics"}
            </Button>
            <Button
              variant="outline"
              className="min-h-11 flex-1"
              disabled={!hydrated || decision === "denied"}
              data-testid="analytics-consent-settings-revoke"
              onClick={decline}
            >
              {decision === "denied" ? "Analytics revoked" : "Revoke analytics"}
            </Button>
          </div>

          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              The choice is stored in this browser only, so it does not follow you to other
              devices or profiles.
            </li>
            <li>
              Revoking stops further analytics hits immediately. Data already collected before
              you revoked is handled per our{" "}
              <Link to="/privacy" className="underline underline-offset-4">
                privacy policy
              </Link>
              .
            </li>
            <li>
              Measurement property in use:{" "}
              <code className="font-mono text-xs">{GOOGLE_ANALYTICS_MEASUREMENT_ID}</code>
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="mt-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings">Back to settings</Link>
        </Button>
      </div>
    </div>
  );
}
