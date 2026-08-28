import { FUNNEL_EVENTS, type FunnelEventName } from "@/lib/funnelAnalytics";

export type FunnelWindow = "last24h" | "last7d" | "last30d" | "total";
export type OpportunityStatus = "signal" | "no_data" | "integrity_warning";

export interface FunnelEventCount {
  eventName: FunnelEventName;
  total: number;
  last24h: number;
  last7d: number;
  last30d: number;
}

export interface FunnelOpportunitySnapshot {
  ok: boolean;
  reason: string | null;
  reasonLabel: string | null;
  generatedAt: string | null;
  counts: FunnelEventCount[];
}

export interface ConversionOpportunity {
  id: "activation" | "upgrade_intent" | "checkout_completion";
  label: string;
  fromLabel: string;
  toLabel: string;
  fromCount: number;
  toCount: number;
  gap: number;
  directionalRatePercent: number | null;
  status: OpportunityStatus;
  rank: number | null;
}

const EVENT_NAMES = new Set<string>(FUNNEL_EVENTS);
const REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  not_authenticated: "Sign in is required to view conversion opportunities.",
  operator_required: "Operator role is required to view conversion opportunities.",
  unknown_response: "Conversion opportunity data was not recognized.",
});

const OPPORTUNITY_DEFINITIONS = [
  {
    id: "activation" as const,
    label: "Improve first-value activation",
    from: "signup" as const,
    to: "quick_log_saved" as const,
    fromLabel: "Signups",
    toLabel: "Quick Logs saved",
  },
  {
    id: "upgrade_intent" as const,
    label: "Clarify upgrade value",
    from: "paywall_viewed" as const,
    to: "paywall_cta_clicked" as const,
    fromLabel: "Paywall views",
    toLabel: "Upgrade clicks",
  },
  {
    id: "checkout_completion" as const,
    label: "Reduce checkout abandonment",
    from: "checkout_started" as const,
    to: "subscription_activated" as const,
    fromLabel: "Checkout starts",
    toLabel: "Subscription activations",
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Parse only aggregate, catalog-known events. Unknown fields and event names are discarded. */
export function parseFunnelOpportunitySnapshot(input: unknown): FunnelOpportunitySnapshot {
  if (!isRecord(input)) {
    return {
      ok: false,
      reason: "unknown_response",
      reasonLabel: REASON_LABELS.unknown_response,
      generatedAt: null,
      counts: [],
    };
  }

  const ok = input.ok === true;
  const reason = asString(input.reason) ?? (ok ? null : "unknown_response");
  const rows = Array.isArray(input.counts_by_event) ? input.counts_by_event : [];
  const counts = rows.flatMap((row): FunnelEventCount[] => {
    if (!isRecord(row) || typeof row.event_name !== "string" || !EVENT_NAMES.has(row.event_name)) {
      return [];
    }
    return [
      {
        eventName: row.event_name as FunnelEventName,
        total: asCount(row.total),
        last24h: asCount(row.last_24h),
        last7d: asCount(row.last_7d),
        last30d: asCount(row.last_30d),
      },
    ];
  });

  return {
    ok,
    reason,
    reasonLabel: reason
      ? (REASON_LABELS[reason] ?? "Conversion opportunity data is unavailable.")
      : null,
    generatedAt: asString(input.generated_at),
    counts,
  };
}

function countFor(
  counts: readonly FunnelEventCount[],
  eventName: FunnelEventName,
  window: FunnelWindow,
): number {
  return counts.find((item) => item.eventName === eventName)?.[window] ?? 0;
}

/**
 * Builds directional signals, not user-cohort conversion claims. Events can repeat and the two
 * sides are not joined by user, so a downstream count above its upstream count is surfaced as an
 * integrity warning instead of being coerced into a plausible-looking percentage.
 */
export function buildConversionOpportunities(
  counts: readonly FunnelEventCount[],
  window: FunnelWindow = "last30d",
): ConversionOpportunity[] {
  const items = OPPORTUNITY_DEFINITIONS.map((definition) => {
    const fromCount = countFor(counts, definition.from, window);
    const toCount = countFor(counts, definition.to, window);
    const status: OpportunityStatus =
      fromCount === 0 ? "no_data" : toCount > fromCount ? "integrity_warning" : "signal";
    return {
      id: definition.id,
      label: definition.label,
      fromLabel: definition.fromLabel,
      toLabel: definition.toLabel,
      fromCount,
      toCount,
      gap: status === "signal" ? fromCount - toCount : 0,
      directionalRatePercent:
        status === "signal" ? Math.round((toCount / fromCount) * 1000) / 10 : null,
      status,
      rank: null,
    } satisfies ConversionOpportunity;
  });

  const ranked = items
    .filter((item) => item.status === "signal")
    .sort(
      (a, b) =>
        b.gap - a.gap ||
        OPPORTUNITY_DEFINITIONS.findIndex((d) => d.id === a.id) -
          OPPORTUNITY_DEFINITIONS.findIndex((d) => d.id === b.id),
    );
  const ranks = new Map(ranked.map((item, index) => [item.id, index + 1]));
  return items.map((item) => ({ ...item, rank: ranks.get(item.id) ?? null }));
}
