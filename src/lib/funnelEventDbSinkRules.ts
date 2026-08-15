/**
 * Pure decision logic for the funnel_events DB sink.
 *
 * The input is a browser CustomEvent's `detail`, which this module treats as
 * UNTRUSTED even though every real dispatch comes from trackFunnelEvent: any
 * script running on the page — a browser extension, a compromised dependency,
 * a curious grower in devtools — can call
 * `window.dispatchEvent(new CustomEvent("verdant:analytics", {...}))` with an
 * arbitrary detail shape. A forged event can only ever write a row scoped to
 * the forger's own account (RLS enforces auth.uid() = user_id), so this is
 * about keeping the table meaningful and privacy-safe, not preventing a
 * cross-account breach.
 *
 * Two things this deliberately does NOT trust from the detail:
 *  - `name` must be a real member of FUNNEL_EVENTS, checked at runtime
 *    (the FunnelEventName type gives no runtime guarantee for data crossing
 *    a CustomEvent boundary).
 *  - `props` is re-run through the SAME sanitizeFunnelParams +
 *    enforceFunnelEventSchema chain the producer already ran. A forged event
 *    could claim any name with any props object; re-validating means a
 *    dispatch outside trackFunnelEvent can never smuggle an unapproved key
 *    or another event's params into storage. This does NOT re-check value
 *    *shape* beyond what sanitizeFunnelParams already does (length + no
 *    whitespace) — it is not a general PII/free-text filter, so a
 *    forged event can still place a compact identifier-shaped string
 *    (e.g. an email with no spaces) into an approved key. That gap lives in
 *    sanitizeFunnelParams itself and applies equally to every real
 *    trackFunnelEvent() call, not just this sink.
 *
 * Consent and identity are supplied by the caller (read from React state),
 * not derived here — this module has no React, no Supabase, no I/O.
 */
import {
  FUNNEL_EVENTS,
  sanitizeFunnelParams,
  type FunnelEventName,
  type FunnelEventParams,
} from "@/lib/funnelAnalytics";
import { enforceFunnelEventSchema } from "@/lib/funnelEventSchema";

const FUNNEL_EVENT_SET: ReadonlySet<string> = new Set(FUNNEL_EVENTS);

export interface FunnelEventDbSinkRow {
  user_id: string;
  event_name: FunnelEventName;
  props: Record<string, string | number | boolean>;
}

export interface FunnelEventDbSinkInput {
  /** The verdant:analytics CustomEvent's `detail`. Untrusted — see above. */
  detail: unknown;
  /** Exactly the useAnalyticsConsent() decision; only "granted" ever writes. */
  consentGranted: boolean;
  /** The signed-in viewer's id, or null when signed out. */
  userId: string | null;
}

export type FunnelEventDbSinkDecision =
  { write: false } | { write: true; row: FunnelEventDbSinkRow };

const NOT_WRITTEN: FunnelEventDbSinkDecision = { write: false };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function decideFunnelEventSinkWrite(
  input: FunnelEventDbSinkInput,
): FunnelEventDbSinkDecision {
  // Consent and identity gate BEFORE anything about the detail is even
  // inspected — a decline or a signed-out visitor should never reach the
  // event-shape logic below.
  if (!input.consentGranted) return NOT_WRITTEN;
  if (!input.userId) return NOT_WRITTEN;

  const detail = input.detail;
  if (!isPlainObject(detail)) return NOT_WRITTEN;

  const { name } = detail;
  if (typeof name !== "string" || !FUNNEL_EVENT_SET.has(name)) return NOT_WRITTEN;

  const safeProps = enforceFunnelEventSchema(
    name as FunnelEventName,
    sanitizeFunnelParams(detail.props as FunnelEventParams),
  );

  return {
    write: true,
    row: {
      user_id: input.userId,
      event_name: name as FunnelEventName,
      props: safeProps,
    },
  };
}
