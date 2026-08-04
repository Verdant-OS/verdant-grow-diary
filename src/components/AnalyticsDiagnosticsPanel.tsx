import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/lib/react-router-compat";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { isGoogleAnalyticsLoaded } from "@/lib/googleAnalyticsLoader";
import {
  GOOGLE_ANALYTICS_MEASUREMENT_ID,
  GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK,
} from "@/constants/analytics";

/**
 * Internal, read-only view of the analytics gate.
 *
 * Reports the stored consent decision, the measurement id actually resolved by
 * this build, whether that id came from the connector or the shipped fallback,
 * and whether the gtag script is present in this document. It changes nothing —
 * granting or revoking happens on /settings/analytics.
 */
export function AnalyticsDiagnosticsPanel() {
  const { decision, hydrated } = useAnalyticsConsent();
  const [tagLoaded, setTagLoaded] = useState<boolean | null>(null);
  const [optedOut, setOptedOut] = useState<boolean | null>(null);

  useEffect(() => {
    setTagLoaded(isGoogleAnalyticsLoaded());
    const flag = (window as unknown as Record<string, unknown>)[
      `ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID}`
    ];
    setOptedOut(flag === true);
  }, [decision]);

  const usingFallback =
    GOOGLE_ANALYTICS_MEASUREMENT_ID === GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK;

  const consentLabel =
    !hydrated ? "Checking…" : decision === "granted" ? "Granted" : decision === "denied" ? "Revoked" : "No choice yet";

  const consentVariant: "default" | "secondary" | "outline" =
    decision === "granted" && hydrated ? "default" : decision === "denied" ? "secondary" : "outline";

  return (
    <Card data-testid="analytics-diagnostics-panel">
      <CardHeader>
        <CardTitle className="text-base">Analytics gate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row label="Consent decision">
          <Badge variant={consentVariant} data-testid="analytics-diagnostics-consent">
            {consentLabel}
          </Badge>
        </Row>

        <Row label="Resolved GA4 measurement ID">
          <code
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
            data-testid="analytics-diagnostics-measurement-id"
          >
            {GOOGLE_ANALYTICS_MEASUREMENT_ID}
          </code>
        </Row>

        <Row label="ID source">
          <Badge variant="outline" data-testid="analytics-diagnostics-id-source">
            {usingFallback ? "Shipped fallback" : "Connector value"}
          </Badge>
        </Row>

        <Row label="gtag.js present in this document">
          <Badge variant={tagLoaded ? "default" : "outline"} data-testid="analytics-diagnostics-tag-loaded">
            {tagLoaded === null ? "Checking…" : tagLoaded ? "Loaded" : "Not loaded"}
          </Badge>
        </Row>

        <Row label="GA kill switch (ga-disable)">
          <Badge variant={optedOut ? "secondary" : "outline"} data-testid="analytics-diagnostics-opt-out">
            {optedOut === null ? "Checking…" : optedOut ? "Opted out" : "Not set"}
          </Badge>
        </Row>

        <p className="text-xs text-muted-foreground">
          Read-only. Values reflect this browser only — consent is stored per browser profile. Change
          your choice on{" "}
          <Link to="/settings/analytics" className="underline">
            the analytics consent page
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
