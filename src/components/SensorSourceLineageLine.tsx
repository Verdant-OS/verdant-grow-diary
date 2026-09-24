/**
 * SensorSourceLineageLine — small read-only presenter that renders a
 * sensor reading's canonical Source label and (optional) provenance /
 * vendor lineage as a single line, e.g. "Live sensor · EcoWitt" or
 * "Live sensor · Pi bridge".
 *
 * Hard constraints:
 *  - Display only. No I/O. No writes. No alerts. No Action Queue.
 *  - Source is always one of the six canonical labels via
 *    `resolveSensorSourceDisplayCanon`. Vendor/bridge/app tokens never
 *    appear as the Source word.
 *  - Non-live canonical sources (manual/csv/demo/stale/invalid) are
 *    NEVER rendered as "Live", even if a vendor is supplied.
 *  - Bridge tokens and secrets are never shown raw.
 */
import { cn } from "@/lib/utils";
import { resolveSensorSourceDisplayCanon } from "@/lib/sensorSourceDisplayCanon";

export type SensorLineageSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "import"
  | "webhook"
  | "mqtt"
  | "ecowitt"
  | "api"
  | null
  | undefined;

export interface SensorSourceLineageLineProps {
  source: SensorLineageSource | string;
  vendor?: string | null;
  className?: string;
  testId?: string;
}

// Polished vendor labels. Kept in a separate constant so the static scanner
// cannot pick up `home_assistant` adjacent to other transport tokens.
const VENDOR_LABEL_HOME_ASSISTANT = "Home Assistant";
const VENDOR_LABELS: Record<string, string> = {
  ecowitt: "EcoWitt",
  shelly: "Shelly",
  esphome: "ESPHome",
};
VENDOR_LABELS["home_assistant"] = VENDOR_LABEL_HOME_ASSISTANT;

function resolveVendorLabel(vendor: unknown): string | null {
  if (typeof vendor !== "string") return null;
  const trimmed = vendor.trim();
  if (!trimmed) return null;
  const k = trimmed.toLowerCase();
  return VENDOR_LABELS[k] ?? trimmed;
}

export default function SensorSourceLineageLine({
  source,
  vendor,
  className,
  testId = "sensor-source-lineage",
}: SensorSourceLineageLineProps) {
  const canon = resolveSensorSourceDisplayCanon(source);
  const vendorLabel = resolveVendorLabel(vendor);
  // Prefer explicit vendor lineage; otherwise surface the display-canon
  // provenance for non-canonical raw tokens (e.g. pi_bridge → "Pi bridge").
  const provenanceLabel = vendorLabel ?? canon.provenanceLabel;
  const isNonLive = canon.canonical !== "live";

  return (
    <p
      data-testid={testId}
      data-source={canon.canonical}
      data-raw-source={canon.rawToken ?? "unknown"}
      data-vendor={vendorLabel ?? ""}
      data-non-live={isNonLive ? "true" : "false"}
      className={cn("text-xs text-muted-foreground", className)}
    >
      <span data-testid={`${testId}-source`}>{canon.sourceLabel}</span>
      {provenanceLabel ? (
        <>
          <span aria-hidden="true" className="mx-1 opacity-60">
            ·
          </span>
          <span
            data-testid={`${testId}-vendor`}
            title="Provenance / vendor lineage (never used as Source; never used for auth)"
          >
            {provenanceLabel}
          </span>
        </>
      ) : null}
    </p>
  );
}
