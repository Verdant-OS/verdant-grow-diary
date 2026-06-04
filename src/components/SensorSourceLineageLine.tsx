/**
 * SensorSourceLineageLine — small read-only presenter that renders a
 * sensor reading's source and (optional) vendor lineage as a single line,
 * e.g. "MQTT · EcoWitt" or "Webhook · Home Assistant".
 *
 * Hard constraints:
 *  - Display only. No I/O. No writes. No alerts. No Action Queue.
 *  - Vendor is **lineage only**. It is never used for auth or trust.
 *  - Non-live sources (manual/csv/demo/stale/invalid/import/unknown)
 *    are NEVER rendered as "Live", even if a vendor is supplied.
 *  - Bridge tokens and secrets are never shown.
 */
import { cn } from "@/lib/utils";

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
  | "pi_bridge"
  | "home_assistant"
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

const SOURCE_LABELS: Record<string, string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
  import: "Import",
  webhook: "Webhook",
  mqtt: "MQTT",
  pi_bridge: "Pi bridge",
  home_assistant: "Home Assistant",
  ecowitt: "EcoWitt",
  api: "API",
};

/** Sources that are explicitly NOT live and must never be rendered as "Live". */
const NON_LIVE_SOURCES = new Set([
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
  "import",
]);

const VENDOR_LABELS: Record<string, string> = {
  ecowitt: "EcoWitt",
  home_assistant: "Home Assistant",
  shelly: "Shelly",
  esphome: "ESPHome",
};

function resolveSourceLabel(source: unknown): string {
  if (typeof source !== "string" || source.length === 0) return "Unknown";
  const k = source.toLowerCase();
  return SOURCE_LABELS[k] ?? source;
}

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
  const sourceLabel = resolveSourceLabel(source);
  const vendorLabel = resolveVendorLabel(vendor);
  const sourceKey = typeof source === "string" ? source.toLowerCase() : "";
  const isNonLive = NON_LIVE_SOURCES.has(sourceKey);
  // Safety gate: if the source is explicitly non-live, never render "Live"
  // even if a vendor label could be promoted. Vendor is lineage only.
  const safeSourceLabel = isNonLive && sourceLabel === "Live" ? "Unknown" : sourceLabel;

  return (
    <p
      data-testid={testId}
      data-source={sourceKey || "unknown"}
      data-vendor={vendorLabel ?? ""}
      data-non-live={isNonLive ? "true" : "false"}
      className={cn("text-xs text-muted-foreground", className)}
    >
      <span data-testid={`${testId}-source`}>{safeSourceLabel}</span>
      {vendorLabel ? (
        <>
          <span aria-hidden="true" className="mx-1 opacity-60">
            ·
          </span>
          <span data-testid={`${testId}-vendor`} title="Vendor lineage (never used for auth)">
            {vendorLabel}
          </span>
        </>
      ) : null}
    </p>
  );
}
