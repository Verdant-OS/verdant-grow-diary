/**
 * SensorSnapshotDetailsDrawer — presenter-only slide-over that surfaces
 * a matched SensorSnapshot's safe fields. Read-only. No writes. No
 * network. No raw payload, no station/MAC/passkey/token/private IP.
 *
 * Missing VPD always renders "Not available", never 0. EcoWitt is a
 * provider, never a canonical source; non-canonical sources render via
 * CanonicalSourceBadge as "Unknown source".
 */
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import CanonicalSourceBadge from "@/components/CanonicalSourceBadge";
import { formatVpdKpa } from "@/lib/vpdCalculationRules";

export interface SensorSnapshotDetailsDrawerData {
  snapshotId: string;
  capturedAt: string | null;
  source: string | null;
  provider: string | null;
  transport: string | null;
  tentId: string | null;
  plantId: string | null;
  vpdKpa: number | null;
  soilMoisturePct: number | null;
  humidityPct: number | null;
  airTemperatureC: number | null;
  confidence: number | null;
  staleOrInvalid: boolean;
}

export interface SensorSnapshotDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: SensorSnapshotDetailsDrawerData | null;
  /** Optional secondary deep-link to the existing sensor surface. */
  detailsHref?: string | null;
}

function fmtNum(v: number | null, suffix = ""): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "Not available";
  return `${v}${suffix}`;
}

function Row({ label, value, testId }: { label: string; value: import("react").ReactNode; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-border/40">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground text-right" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

export default function SensorSnapshotDetailsDrawer({
  open,
  onOpenChange,
  data,
  detailsHref,
}: SensorSnapshotDetailsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" data-testid="sensor-snapshot-details-drawer">
        {data ? (
          <>
            <SheetHeader>
              <SheetTitle>Sensor snapshot</SheetTitle>
              <SheetDescription>
                Matched fields only. Raw payload, station IDs, and secrets are never shown here.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 flex flex-col gap-1">
              <div className="pb-2">
                <CanonicalSourceBadge
                  testId="snapshot-drawer-source-badge"
                  source={data.source}
                  provider={data.provider}
                />
              </div>
              <Row
                label="captured_at"
                value={data.capturedAt ?? "Not available"}
                testId="snapshot-drawer-captured-at"
              />
              <Row label="transport" value={data.transport ?? "Not available"} testId="snapshot-drawer-transport" />
              <Row label="tent_id" value={data.tentId ?? "Not available"} testId="snapshot-drawer-tent-id" />
              {data.plantId && (
                <Row label="plant_id" value={data.plantId} testId="snapshot-drawer-plant-id" />
              )}
              <Row
                label="VPD (kPa)"
                value={
                  data.vpdKpa === null || data.vpdKpa === 0
                    ? "Not available"
                    : formatVpdKpa(data.vpdKpa)
                }
                testId="snapshot-drawer-vpd"
              />
              <Row
                label="Soil moisture"
                value={fmtNum(data.soilMoisturePct, "%")}
                testId="snapshot-drawer-soil"
              />
              <Row
                label="Humidity"
                value={fmtNum(data.humidityPct, "%")}
                testId="snapshot-drawer-humidity"
              />
              <Row
                label="Air temperature"
                value={fmtNum(data.airTemperatureC, "°C")}
                testId="snapshot-drawer-air-temp"
              />
              <Row
                label="Confidence"
                value={fmtNum(data.confidence)}
                testId="snapshot-drawer-confidence"
              />
              {data.staleOrInvalid && (
                <p
                  data-testid="snapshot-drawer-stale-warning"
                  className="text-[11px] text-amber-700 dark:text-amber-300 mt-2"
                >
                  Snapshot is stale or invalid — do not treat as healthy current data.
                </p>
              )}
              {detailsHref && (
                <a
                  href={detailsHref}
                  data-testid="snapshot-drawer-details-href"
                  className="mt-3 inline-flex items-center text-xs underline text-muted-foreground hover:text-foreground"
                >
                  Open in sensor view
                </a>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="snapshot-drawer-empty">
            Sensor snapshot not linked.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
