/**
 * Pi Ingest Status — read-only operator surface.
 *
 * Shows ingest health derived from already-accepted sensor_readings
 * where source = "pi_bridge". No writes, no automation, no device
 * control, no alert creation, no Action Queue handoff.
 */
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePiIngestStatus } from "@/hooks/usePiIngestStatus";
import {
  PI_INGEST_DISCLOSURE_LINES,
  PI_INGEST_HEALTH_LABEL,
} from "@/lib/piIngestStatusRules";

function healthVariant(
  h: "no_data" | "recently_active" | "stale",
): "default" | "secondary" | "destructive" | "outline" {
  if (h === "recently_active") return "default";
  if (h === "stale") return "destructive";
  return "secondary";
}

export default function PiIngestStatus() {
  const { data, isLoading, error } = usePiIngestStatus();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pi Ingest Status"
        description="Read-only ingest health for the Raspberry Pi bridge."
      />

      <Card data-testid="pi-ingest-status-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Bridge health</span>
            {data && (
              <Badge variant={healthVariant(data.summary.health)}>
                {PI_INGEST_HEALTH_LABEL[data.summary.health]}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-destructive">
              Could not load ingest status.
            </p>
          )}
          {data && (
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Latest reading</dt>
                <dd data-testid="pi-ingest-latest-at">
                  {data.summary.latestAt
                    ? data.summary.latestAt.toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Latest tent</dt>
                <dd data-testid="pi-ingest-latest-tent">
                  {data.latestTentName ??
                    data.summary.latestTentId ??
                    "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Readings (last 24h)</dt>
                <dd data-testid="pi-ingest-count-24h">
                  {data.summary.count24h}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Readings (last 7d)</dt>
                <dd data-testid="pi-ingest-count-7d">
                  {data.summary.count7d}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Latest metrics</dt>
                <dd
                  data-testid="pi-ingest-latest-metrics"
                  className="flex flex-wrap gap-1 pt-1"
                >
                  {data.summary.latestMetrics.length === 0 ? (
                    <span>—</span>
                  ) : (
                    data.summary.latestMetrics.map((m) => (
                      <Badge key={m} variant="outline">
                        {m}
                      </Badge>
                    ))
                  )}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Disclosure</CardTitle>
        </CardHeader>
        <CardContent>
          <ul
            className="list-disc space-y-1 pl-5 text-sm text-muted-foreground"
            data-testid="pi-ingest-disclosure"
          >
            {PI_INGEST_DISCLOSURE_LINES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
