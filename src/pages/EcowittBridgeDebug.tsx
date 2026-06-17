/**
 * EcoWitt Bridge Debug — operator-only, read-only full-screen page.
 *
 * Reuses EcowittLocalForwardingStatusWidget for forwarding status,
 * banner, refresh, and sanitized copy. Adds dedicated debug-page chrome
 * with localhost endpoint labels for forwarding-status and
 * forwarding-error-report.
 *
 * Strict rules:
 *  - Only reads http://localhost:8787 via GET.
 *  - No Supabase. No POST. No forwarding trigger. No AI / alerts / action queue.
 *  - No token, raw payload, ingest URL, PASSKEY, or .env rendering.
 */
import EcowittLocalForwardingStatusWidget from "@/components/EcowittLocalForwardingStatusWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LOCAL_FORWARDING_ERROR_REPORT_URL,
  LOCAL_FORWARDING_STATUS_URL,
} from "@/lib/ecowittLocalForwardingStatus";

export default function EcowittBridgeDebug() {
  return (
    <div
      className="container mx-auto py-6 space-y-6"
      data-testid="ecowitt-bridge-debug-page"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          EcoWitt Bridge Debug
        </h1>
        <p className="text-sm text-muted-foreground">
          Operator-only diagnostics for the local EcoWitt listener. Reads
          localhost only — no data is sent to Verdant from this page.
        </p>
      </header>

      <section
        aria-labelledby="forwarding-status-heading"
        data-testid="ecowitt-bridge-debug-forwarding-status-section"
        className="space-y-2"
      >
        <h2
          id="forwarding-status-heading"
          className="text-lg font-medium"
        >
          Forwarding status
        </h2>
        <p className="text-xs text-muted-foreground">
          Source:{" "}
          <a
            href={LOCAL_FORWARDING_STATUS_URL}
            target="_blank"
            rel="noreferrer"
            className="underline"
            data-testid="ecowitt-bridge-debug-forwarding-status-link"
          >
            {LOCAL_FORWARDING_STATUS_URL}
          </a>
        </p>
        <EcowittLocalForwardingStatusWidget />
      </section>

      <section
        aria-labelledby="forwarding-error-report-heading"
        data-testid="ecowitt-bridge-debug-forwarding-error-report-section"
        className="space-y-2"
      >
        <h2
          id="forwarding-error-report-heading"
          className="text-lg font-medium"
        >
          Forwarding error report
        </h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Sanitized forwarding error report
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              The forwarding status card above includes a{" "}
              <span className="font-medium">
                Copy sanitized forwarding report
              </span>{" "}
              button that fetches the local error report and copies an
              allow-listed JSON payload to your clipboard.
            </p>
            <p className="text-xs text-muted-foreground">
              Source:{" "}
              <a
                href={LOCAL_FORWARDING_ERROR_REPORT_URL}
                target="_blank"
                rel="noreferrer"
                className="underline"
                data-testid="ecowitt-bridge-debug-forwarding-error-report-link"
              >
                {LOCAL_FORWARDING_ERROR_REPORT_URL}
              </a>
            </p>
            <p className="text-xs text-muted-foreground">
              The copied payload never includes bridge tokens, Authorization
              headers, PASSKEY, ingest URL, raw payloads, .env values, or
              database error messages.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
