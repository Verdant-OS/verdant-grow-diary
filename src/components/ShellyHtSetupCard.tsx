/**
 * Shelly H&T Gen4 read-only setup/status card.
 *
 * - Surfaces configuration status (not-configured / awaiting / receiving
 *   / stale) derived from server-resolved flags + latest tent readings.
 * - Shows masked token suffix only (never the raw secret).
 * - Includes safe Shelly setup instructions and a "Copy webhook URL"
 *   action that copies ONLY the public function URL (no token).
 * - Reuses the existing `SOURCE_LABEL` + Shelly device label helpers —
 *   no duplicated mapping tables here.
 *
 * Read-only. No automation, no device control, no alerts, no
 * action_queue. Logic lives in `shellyHtSetupRules.ts`.
 */
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Copy, Radio, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useShellyHtSetupStatus } from "@/hooks/useShellyHtSetupStatus";
import { buildRecentSensorSnapshotHistory } from "@/lib/recentSensorSnapshotHistoryRules";
import {
  deriveShellyHtSetupStatus,
  findLatestShellyHtSnapshot,
} from "@/lib/shellyHtSetupRules";
import {
  deriveShellyHtSetupCardViewState,
  SHELLY_HT_SETUP_SLOW_THRESHOLD_MS,
} from "@/lib/shellyHtSetupCardViewStateRules";
import { SHELLY_HT_DEVICE_LABEL } from "@/lib/shellyHtWebhookRules";
import { SOURCE_LABEL, formatValue } from "@/lib/sensorSnapshot";
import { tempFFromC } from "@/lib/temperatureUnits";
import type { PlantTentReadingRow } from "@/hooks/usePlantTentLatestReadings";

interface Props {
  rows: ReadonlyArray<PlantTentReadingRow>;
}

const STATE_BADGE_CLASS: Record<string, string> = {
  "not-configured": "border-muted text-muted-foreground",
  "awaiting-first-reading": "border-muted text-muted-foreground",
  receiving: "border-emerald-500/60 text-emerald-500",
  stale: "border-[hsl(var(--warning))] text-[hsl(var(--warning))]",
};

const STATE_LABEL: Record<string, string> = {
  "not-configured": "Not configured",
  "awaiting-first-reading": "Waiting for first reading",
  receiving: "Receiving readings",
  stale: "Stale",
};

export default function ShellyHtSetupCard({ rows }: Props) {
  const { data: status, isLoading, error } = useShellyHtSetupStatus();
  const [copied, setCopied] = useState(false);

  const latest = useMemo(() => {
    const history = buildRecentSensorSnapshotHistory(rows, { limit: 5 });
    return findLatestShellyHtSnapshot(history, SHELLY_HT_DEVICE_LABEL);
  }, [rows]);

  const view = useMemo(
    () =>
      deriveShellyHtSetupStatus({
        configured: !!status?.configured,
        tentAssignedToCaller: !!status?.tentAssignedToCaller,
        latest,
      }),
    [status, latest],
  );

  async function onCopyUrl() {
    if (!status?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(status.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // no-op
    }
  }

  const tempF = latest ? tempFFromC(latest.temp) : null;

  return (
    <Card
      className="mt-4"
      data-testid="shelly-ht-setup-card"
      data-state={view.state}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="h-4 w-4" /> Shelly H&T Gen4
        </CardTitle>
        <span
          className={`text-xs rounded-md border px-1.5 py-0.5 ${STATE_BADGE_CLASS[view.state] ?? ""}`}
          data-testid="shelly-ht-setup-status-badge"
        >
          {STATE_LABEL[view.state]}
        </span>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        {isLoading ? (
          <p className="text-muted-foreground">Checking setup…</p>
        ) : error ? (
          <p
            className="text-muted-foreground"
            data-testid="shelly-ht-setup-error"
          >
            Couldn't load Shelly setup status.
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <div
                className="font-semibold"
                data-testid="shelly-ht-setup-headline"
              >
                {view.headline}
              </div>
              <p
                className="text-xs text-muted-foreground"
                data-testid="shelly-ht-setup-body"
              >
                {view.body}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div data-testid="shelly-ht-setup-tent">
                <span className="text-muted-foreground">Tent: </span>
                {status?.tentAssignedToCaller && status?.tentName
                  ? status.tentName
                  : status?.configured
                    ? "Not in your account"
                    : "—"}
              </div>
              <div data-testid="shelly-ht-setup-token">
                <span className="text-muted-foreground">Token: </span>
                {status?.tokenMask ?? "—"}
              </div>
            </div>

            {view.showLatest && latest ? (
              <div
                className="rounded-md border p-2 space-y-1"
                data-testid="shelly-ht-setup-latest"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className="rounded-md border px-1.5 py-0.5"
                    data-testid="shelly-ht-setup-latest-source"
                  >
                    {SOURCE_LABEL[latest.source]}
                  </span>
                  <span
                    className="rounded-md border px-1.5 py-0.5 text-muted-foreground"
                    data-testid="shelly-ht-setup-latest-device"
                  >
                    {latest.deviceDetail}
                  </span>
                  <span
                    className="text-muted-foreground"
                    data-testid="shelly-ht-setup-latest-captured"
                  >
                    {formatDistanceToNow(new Date(latest.ts), {
                      addSuffix: true,
                    })}
                  </span>
                  {view.isStale ? (
                    <span
                      className="rounded-md border border-[hsl(var(--warning))] px-1.5 py-0.5 text-[hsl(var(--warning))]"
                      data-testid="shelly-ht-setup-latest-stale"
                    >
                      Stale
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {tempF !== null ? (
                    <span data-testid="shelly-ht-setup-latest-temp">
                      {formatValue(tempF, "°F", 1)}
                    </span>
                  ) : null}
                  {latest.rh !== null ? (
                    <span data-testid="shelly-ht-setup-latest-rh">
                      {formatValue(latest.rh, "%", 0)}
                    </span>
                  ) : null}
                  {latest.vpd !== null ? (
                    <span data-testid="shelly-ht-setup-latest-vpd">
                      {formatValue(latest.vpd, " kPa", 2)}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <details
              className="rounded-md border p-2"
              data-testid="shelly-ht-setup-instructions"
            >
              <summary className="cursor-pointer text-xs font-semibold">
                Setup instructions
              </summary>
              <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                <p>
                  In the Shelly app for your H&T Gen4, add an Outbound Webhook:
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    Method: <code>POST</code>
                  </li>
                  <li>
                    URL:{" "}
                    <code data-testid="shelly-ht-setup-webhook-url">
                      {status?.webhookUrl ?? "—"}
                    </code>
                  </li>
                  <li>
                    Header:{" "}
                    <code>x-verdant-webhook-token: &lt;your token&gt;</code>{" "}
                    (or append <code>?token=…</code> to the URL)
                  </li>
                  <li>
                    JSON body example:
                    <pre className="mt-1 whitespace-pre-wrap rounded bg-muted/40 p-2">{`{
  "temperature_f": 75.2,
  "humidity": 55,
  "device_id": "<your shelly id>"
}`}</pre>
                  </li>
                </ol>
                <p>
                  Keep your token in a password manager. Verdant only ever
                  displays a masked suffix.
                </p>
              </div>
            </details>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={onCopyUrl}
                disabled={!status?.webhookUrl}
                data-testid="shelly-ht-setup-copy-url"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy webhook URL"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
