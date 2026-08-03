/**
 * Per-event runtime schema for `verdant:analytics` funnel events.
 *
 * `sanitizeFunnelParams` (see funnelAnalytics.ts) enforces the GLOBAL
 * allowlist of parameter keys and value shapes. This module narrows that
 * further to the ALLOWED KEYS PER EVENT so a call site can never
 * accidentally leak a key that is valid in the global catalog but has no
 * business on this specific event (e.g. attaching a `plan` to
 * `grow_created`, or a free-text-shaped `reason` to `signup`).
 *
 * Behavior:
 *  - Any key not in the per-event allowlist is DROPPED silently in
 *    production. In dev/test, we log a single-line JSON warning + emit an
 *    aggregate `verdant:analytics_schema_violation` funnel-adjacent event
 *    (dispatched on the same window channel) so drift is observable.
 *  - The event itself is NEVER refused — analytics must remain fire-and-
 *    forget so a schema bug cannot block a save or checkout path.
 *  - The schema is the ONLY source of truth. Adding a new key/event pair
 *    requires editing this file, which the tests pin against
 *    FUNNEL_EVENTS and FUNNEL_PARAM_KEYS.
 */

import type { FunnelEventName, FunnelEventParams } from "@/lib/funnelAnalytics";
import { FUNNEL_PARAM_KEYS } from "@/lib/funnelAnalytics";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";

type FunnelParamKey = (typeof FUNNEL_PARAM_KEYS)[number];

/**
 * Approved keys per funnel event. Exhaustive: every entry in
 * FUNNEL_EVENTS must appear (the wiring test asserts this).
 */
export const FUNNEL_EVENT_SCHEMA: Readonly<Record<FunnelEventName, ReadonlyArray<FunnelParamKey>>> =
  {
    signup: ["method"],
    grow_created: [],
    tent_created: [],
    plant_created: [],
    quick_log_saved: ["event_type"],
    csv_history_onboarding_ready: ["surface"],
    csv_import_started: [],
    csv_import_completed: ["rows"],
    csv_history_ai_doctor_clicked: ["surface"],
    ai_doctor_review_started: ["surface"],
    historical_ai_review_started: [],
    ai_doctor_result_received: ["surface"],
    ai_doctor_session_saved: ["surface"],
    paywall_viewed: ["surface"],
    paywall_cta_clicked: ["surface", "plan"],
    checkout_started: ["plan"],
    checkout_catalog_unavailable: ["plan", "reason"],
    checkout_recovery_dismissed: ["plan"],
    checkout_recovery_choose_another_plan: ["plan"],
    checkout_recovery_retry: ["plan"],
    checkout_recovery_plan_slug_fallback: ["reason", "length_bucket"],
    subscription_activated: ["plan", "surface"],
    checkout_return_completed: ["surface"],
  };

// Precomputed per-event Set for O(1) membership checks.
const SCHEMA_SET: Readonly<Record<FunnelEventName, ReadonlySet<FunnelParamKey>>> =
  Object.fromEntries(
    (Object.keys(FUNNEL_EVENT_SCHEMA) as FunnelEventName[]).map((name) => [
      name,
      new Set(FUNNEL_EVENT_SCHEMA[name]),
    ]),
  ) as unknown as Record<FunnelEventName, ReadonlySet<FunnelParamKey>>;

// Observability counter for tests / diagnostics.
let schemaViolationCount = 0;
export function getFunnelSchemaViolationCount(): number {
  return schemaViolationCount;
}
export function __resetFunnelSchemaViolationCountForTests(): void {
  schemaViolationCount = 0;
}

const IS_DEV =
  (typeof import.meta !== "undefined" &&
    (import.meta as ImportMeta & { env?: { DEV?: boolean; MODE?: string } }).env?.DEV === true) ||
  (typeof process !== "undefined" && process.env?.NODE_ENV !== "production");

function reportViolation(name: FunnelEventName, droppedKeys: string[]) {
  schemaViolationCount += 1;
  if (!IS_DEV) return;
  const line = JSON.stringify({
    event: "verdant:analytics_schema_violation",
    funnel_event: name,
    dropped_keys: droppedKeys.slice(0, 8).sort(),
  });
  try {
    // eslint-disable-next-line no-console
    console.warn(line);
  } catch {
    /* analytics must never break the product */
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(PRICING_ANALYTICS_EVENT, {
          detail: {
            name: "verdant:analytics_schema_violation",
            props: { funnel_event: name },
          },
        }),
      );
    }
  } catch {
    /* same */
  }
}

/**
 * Return a shallow copy of `safeParams` restricted to the keys the
 * per-event schema allows. Assumes input already passed
 * `sanitizeFunnelParams` (so values are known-safe primitives).
 */
export function enforceFunnelEventSchema(
  name: FunnelEventName,
  safeParams: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const allowed = SCHEMA_SET[name];
  if (!allowed) {
    // Unknown event name — should be unreachable given the FunnelEventName
    // type, but a runtime cast at a call site could get here. Drop
    // everything and record the drift.
    if (Object.keys(safeParams).length > 0) {
      reportViolation(name, Object.keys(safeParams));
    }
    return {};
  }
  const out: Record<string, string | number | boolean> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(safeParams)) {
    if (allowed.has(key as FunnelParamKey)) {
      out[key] = value;
    } else {
      dropped.push(key);
    }
  }
  if (dropped.length > 0) reportViolation(name, dropped);
  return out;
}

export type { FunnelEventName, FunnelEventParams };
