/**
 * Grow OS data source label rules.
 *
 * Pure helper that classifies a grow data value/snapshot into one of five
 * labels: Live | Manual | Demo | Stale | Unavailable.
 *
 * No React, no Supabase, no I/O. Deterministic for any given input + `now`.
 */

export type GrowDataSourceLabel =
  | "Live"
  | "Manual"
  | "Demo"
  | "Stale"
  | "Unavailable";

export type GrowDataSourceSeverity = "good" | "info" | "watch" | "warning";

export interface GrowDataSourceInput {
  /** Raw source identifier (e.g. "supabase", "sensor", "manual", "mock"). */
  source?: string | null;
  /** The numeric value, if any. */
  value?: number | string | null;
  /** ISO timestamp, Date, or millis. */
  timestamp?: string | number | Date | null;
}

export interface GrowDataSourceLabelOptions {
  /** Stale threshold in milliseconds. Default 15 minutes. */
  staleThresholdMs?: number;
  /** Injectable "now" for deterministic tests. */
  now?: number | Date;
}

export interface GrowDataSourceLabelResult {
  label: GrowDataSourceLabel;
  severity: GrowDataSourceSeverity;
  message: string;
  shouldDisplayBadge: boolean;
  isTrustedForAi: boolean;
  reasons: string[];
}

const DEFAULT_STALE_MS = 15 * 60 * 1000;

const DEMO_SOURCES = new Set(["mock", "demo", "fake", "sample", "fixture"]);
const MANUAL_SOURCES = new Set(["manual", "user", "entry", "log"]);
const LIVE_SOURCES = new Set([
  "supabase",
  "sensor",
  "home_assistant",
  "homeassistant",
  "mqtt",
  "api",
  "device",
  "gateway",
]);

function normalizeSource(source: unknown): string | null {
  if (typeof source !== "string") return null;
  const trimmed = source.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function toMillis(ts: unknown): number | null {
  if (ts === null || ts === undefined) return null;
  if (ts instanceof Date) {
    const t = ts.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof ts === "number") {
    return Number.isFinite(ts) ? ts : null;
  }
  if (typeof ts === "string") {
    const trimmed = ts.trim();
    if (!trimmed) return null;
    const t = Date.parse(trimmed);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function resolveNow(now: GrowDataSourceLabelOptions["now"]): number {
  if (now instanceof Date) return now.getTime();
  if (typeof now === "number" && Number.isFinite(now)) return now;
  return Date.now();
}

export function classifyGrowDataSource(
  input: GrowDataSourceInput | null | undefined,
  options: GrowDataSourceLabelOptions = {},
): GrowDataSourceLabelResult {
  const reasons: string[] = [];
  const staleThresholdMs =
    typeof options.staleThresholdMs === "number" &&
    Number.isFinite(options.staleThresholdMs) &&
    options.staleThresholdMs > 0
      ? options.staleThresholdMs
      : DEFAULT_STALE_MS;
  const now = resolveNow(options.now);

  const source = normalizeSource(input?.source);
  const valuePresent = hasValue(input?.value);
  const tsRaw = input?.timestamp ?? null;
  const tsMillis = toMillis(tsRaw);
  const tsProvided = tsRaw !== null && tsRaw !== undefined && tsRaw !== "";
  const tsInvalid = tsProvided && tsMillis === null;
  const ageMs = tsMillis !== null ? now - tsMillis : null;
  const isStale =
    ageMs !== null && (ageMs > staleThresholdMs || ageMs < -staleThresholdMs);

  // 1. Demo / mock always wins — never trusted, never Live.
  if (source && DEMO_SOURCES.has(source)) {
    reasons.push("source marked as demo/mock");
    return {
      label: "Demo",
      severity: "info",
      message: "Demo data — not a live reading.",
      shouldDisplayBadge: true,
      isTrustedForAi: false,
      reasons,
    };
  }

  // 2. Unavailable: no source AND no value.
  if (!source && !valuePresent) {
    reasons.push("missing source");
    reasons.push("missing value");
    return {
      label: "Unavailable",
      severity: "warning",
      message: "No reading available.",
      shouldDisplayBadge: true,
      isTrustedForAi: false,
      reasons,
    };
  }

  // 3. Missing value alone.
  if (!valuePresent) {
    reasons.push("missing value");
    return {
      label: "Unavailable",
      severity: "warning",
      message: "No reading available.",
      shouldDisplayBadge: true,
      isTrustedForAi: false,
      reasons,
    };
  }

  // 4. Missing source (value present).
  if (!source) {
    reasons.push("missing source");
    return {
      label: "Unavailable",
      severity: "warning",
      message: "Reading has no known source.",
      shouldDisplayBadge: true,
      isTrustedForAi: false,
      reasons,
    };
  }

  // 5. Invalid timestamp for a real source.
  if (tsInvalid) {
    reasons.push("invalid timestamp");
    return {
      label: "Stale",
      severity: "warning",
      message: "Reading timestamp is invalid.",
      shouldDisplayBadge: true,
      isTrustedForAi: false,
      reasons,
    };
  }

  // 6. Manual entry.
  if (MANUAL_SOURCES.has(source)) {
    if (tsMillis === null) {
      reasons.push("manual entry without timestamp");
      return {
        label: "Unavailable",
        severity: "warning",
        message: "Manual entry is missing a timestamp.",
        shouldDisplayBadge: true,
        isTrustedForAi: false,
        reasons,
      };
    }
    if (isStale) {
      reasons.push("manual entry older than stale threshold");
      return {
        label: "Stale",
        severity: "warning",
        message: "Manual entry is older than the freshness window.",
        shouldDisplayBadge: true,
        isTrustedForAi: false,
        reasons,
      };
    }
    reasons.push("manual entry within freshness window");
    return {
      label: "Manual",
      severity: "info",
      message: "Manually entered reading.",
      shouldDisplayBadge: true,
      isTrustedForAi: true,
      reasons,
    };
  }

  // 7. Live sources.
  if (LIVE_SOURCES.has(source)) {
    if (tsMillis === null) {
      reasons.push("live source without timestamp");
      return {
        label: "Stale",
        severity: "warning",
        message: "Live reading is missing a timestamp.",
        shouldDisplayBadge: true,
        isTrustedForAi: false,
        reasons,
      };
    }
    if (isStale) {
      reasons.push("live reading older than stale threshold");
      return {
        label: "Stale",
        severity: "warning",
        message: "Live reading is older than the freshness window.",
        shouldDisplayBadge: true,
        isTrustedForAi: false,
        reasons,
      };
    }
    reasons.push("live source within freshness window");
    return {
      label: "Live",
      severity: "good",
      message: "Live reading.",
      shouldDisplayBadge: false,
      isTrustedForAi: true,
      reasons,
    };
  }

  // 8. Unknown source — treat as Unavailable for AI safety.
  reasons.push("unrecognized source");
  return {
    label: "Unavailable",
    severity: "warning",
    message: "Reading source is not recognized.",
    shouldDisplayBadge: true,
    isTrustedForAi: false,
    reasons,
  };
}
