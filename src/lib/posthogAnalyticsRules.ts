/**
 * Pure PostHog collection rules. No SDK import, no network, no clock.
 *
 * The browser client may load posthog-js only when `decidePostHogStartup`
 * returns enabled: analytics consent is granted, the route is not excluded,
 * the hostname is an exact production host, a project key is present, and
 * the API host is https with no userinfo. Anything else stays off.
 */

import type { CaptureResult, PostHogConfig } from "posthog-js";

import type { AnalyticsConsentDecision } from "@/lib/analyticsConsent";
import { buildSafeAnalyticsPageLocation, sanitizePagePath } from "@/lib/analyticsPageViewRules";
import { PRODUCTION_HOSTNAMES } from "@/lib/errorReportingRules";
import { GROW_HELP_TOOLKIT_PATH } from "@/lib/growHelpToolkitState";

export const POSTHOG_DEFAULT_API_HOST = "https://us.i.posthog.com";

const DISTINCT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNUP_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXCEPTION_TYPE_RE = /^[A-Za-z_][A-Za-z0-9_.$]{0,79}$/;
const SENSITIVE_KEY_RE =
  /(note|diary|sensor|payload|email|name|message|text|content|body|csv|comment|caption|strain|cultivar|temperature|humidity|moisture|vpd|reading)/i;
const URL_KEY_RE = /(url|pathname|referrer|path)$/i;

export type PostHogStartup =
  | {
      enabled: false;
      reason: "consent" | "excluded-route" | "non-production-host" | "missing-key" | "invalid-host";
    }
  | { enabled: true; key: string; apiHost: string };

export type PostHogProductEvent = {
  name: "user_signed_up" | "grow_created" | "plant_created" | "log_created" | "sensor_csv_imported";
  properties: Record<string, string | number>;
};

/** Exact production hosts only. One trailing dot is ignored. No suffix match. */
export function isAnalyticsCollectionHost(hostname: string | null | undefined): boolean {
  if (typeof hostname !== "string") return false;
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized) return false;
  return (PRODUCTION_HOSTNAMES as readonly string[]).includes(normalized);
}

export function isExcludedAnalyticsPath(pathname: string): boolean {
  return pathname === GROW_HELP_TOOLKIT_PATH || pathname === `${GROW_HELP_TOOLKIT_PATH}/`;
}

/** Empty means the US cloud default. Any other value must be an https origin. */
export function resolvePostHogApiHost(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return POSTHOG_DEFAULT_API_HOST;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;
  if (parsed.pathname !== "" && parsed.pathname !== "/") return null;
  return parsed.origin;
}

export function decidePostHogStartup(input: {
  decision: AnalyticsConsentDecision;
  pathname: string;
  key: string | null | undefined;
  host: string | null | undefined;
  hostname: string | null | undefined;
}): PostHogStartup {
  if (input.decision !== "granted") return { enabled: false, reason: "consent" };
  if (isExcludedAnalyticsPath(input.pathname)) return { enabled: false, reason: "excluded-route" };
  if (!isAnalyticsCollectionHost(input.hostname)) {
    return { enabled: false, reason: "non-production-host" };
  }
  const key = (input.key ?? "").trim();
  if (!key) return { enabled: false, reason: "missing-key" };
  const apiHost = resolvePostHogApiHost(input.host);
  if (!apiHost) return { enabled: false, reason: "invalid-host" };
  return { enabled: true, key, apiHost };
}

/** Account UUID only. An address, or any other non-UUID, is refused. */
export function posthogDistinctId(userId: string | null | undefined): string | null {
  if (typeof userId !== "string") return null;
  const trimmed = userId.trim();
  if (!trimmed || trimmed.includes("@") || !DISTINCT_ID_RE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Person properties are a fixed subset. `email` is read only to set the
 * boolean `qa_synth` marker and is never copied onto the result.
 */
export function posthogPersonProperties(input: {
  createdAt: string | null | undefined;
  email: string | null | undefined;
}): { signup_date?: string; qa_synth?: true } {
  const properties: { signup_date?: string; qa_synth?: true } = {};
  if (typeof input.createdAt === "string" && SIGNUP_DAY_RE.test(input.createdAt.slice(0, 10))) {
    properties.signup_date = input.createdAt.slice(0, 10);
  }
  const email = (input.email ?? "").toLowerCase();
  if (email.includes("+verdantqa") || email.includes("verdant-qa-") || email.includes("qa-synth")) {
    properties.qa_synth = true;
  }
  return properties;
}

export function posthogPageviewProperties(
  origin: string,
  input: string,
): { $pathname: string; $current_url: string } {
  return {
    $pathname: sanitizePagePath(input),
    $current_url: buildSafeAnalyticsPageLocation(origin, input),
  };
}

/**
 * Maps the existing `verdant:analytics` funnel names onto the product events
 * this slice is allowed to send. Billing, paywall, checkout, subscription,
 * credit pack, and AI doctor events are dropped. Vendor and row text are
 * never copied. `rows` becomes `row_count` only as an integer in range.
 */
export function mapFunnelEventToPostHog(
  name: string,
  props: Record<string, unknown> | null | undefined,
): PostHogProductEvent[] {
  switch (name) {
    case "signup":
      return [{ name: "user_signed_up", properties: {} }];
    case "grow_created":
      return [{ name: "grow_created", properties: {} }];
    case "plant_created":
      return [{ name: "plant_created", properties: {} }];
    case "quick_log_saved":
      return [{ name: "log_created", properties: { source: "quick_log" } }];
    case "csv_import_completed":
      return csvImportEvents(props);
    default:
      return [];
  }
}

function csvImportEvents(props: Record<string, unknown> | null | undefined): PostHogProductEvent[] {
  const events: PostHogProductEvent[] = [
    { name: "log_created", properties: { source: "csv_import" } },
  ];
  const rows = props?.rows;
  if (typeof rows === "number" && Number.isInteger(rows) && rows >= 0 && rows <= 1_000_000) {
    events.push({ name: "sensor_csv_imported", properties: { row_count: rows } });
  }
  return events;
}

const PRODUCT_PROPERTY_KEYS: Record<string, readonly string[]> = {
  $pageview: ["$pathname", "$current_url"],
  user_signed_up: [],
  grow_created: [],
  plant_created: [],
  log_created: ["source"],
  sensor_csv_imported: ["row_count"],
};

/** Drops diary text, sensor numbers, CSV bodies, and exception messages. */
export function scrubPostHogCapture(capture: CaptureResult): CaptureResult | null {
  if (capture.event === "$exception") {
    return {
      ...capture,
      properties: scrubExceptionProperties(capture.properties),
      $set: undefined,
      $set_once: undefined,
    };
  }
  const allowed = PRODUCT_PROPERTY_KEYS[capture.event];
  const properties = allowed
    ? allowProductProperties(capture.event, capture.properties, allowed)
    : scrubGenericProperties(capture.properties);
  return {
    ...capture,
    properties,
    $set: scrubPersonSet(capture.$set),
    $set_once: scrubPersonSet(capture.$set_once),
  };
}

export function buildPostHogInitOptions(apiHost: string): Partial<PostHogConfig> {
  return {
    api_host: apiHost,
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    rageclick: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    mask_personal_data_properties: true,
    person_profiles: "identified_only",
    advanced_disable_feature_flags: true,
    disable_surveys: true,
    enable_recording_console_log: false,
    capture_performance: false,
    persistence: "localStorage+cookie",
    property_denylist: ["email", "$email", "name", "note", "notes", "diary"],
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask], .ph-mask",
      maskTextClass: "ph-mask",
      blockClass: "ph-no-capture",
      recordHeaders: false,
      recordBody: false,
      captureJsonLd: false,
    },
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    before_send: scrubPostHogCapture,
  };
}

function allowProductProperties(
  event: string,
  properties: Record<string, unknown> | undefined,
  keys: readonly string[],
): Record<string, unknown> {
  const source = properties ?? {};
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === "source" && event === "log_created") {
      if (source.source === "quick_log" || source.source === "csv_import")
        out.source = source.source;
      continue;
    }
    if (key === "row_count" && event === "sensor_csv_imported") {
      const rows = source.row_count;
      if (typeof rows === "number" && Number.isInteger(rows) && rows >= 0 && rows <= 1_000_000) {
        out.row_count = rows;
      }
      continue;
    }
    if (key === "$pathname" || key === "$current_url") {
      const value = source[key];
      if (typeof value === "string") out[key] = sanitizeLocationValue(value, key === "$pathname");
    }
  }
  return out;
}

function scrubGenericProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (key === "row_count") continue;
    if (SENSITIVE_KEY_RE.test(key)) continue;
    if (typeof value === "string") {
      if (URL_KEY_RE.test(key)) {
        const pathnameOnly = key.endsWith("pathname") || key.endsWith("path");
        out[key] = sanitizeLocationValue(value, pathnameOnly);
        continue;
      }
      if (value.includes("@") || value.length > 120 || value.includes("\n")) continue;
      out[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

function scrubExceptionProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const source = properties ?? {};
  const out: Record<string, unknown> = {};
  const type = exceptionType(source.$exception_type);
  if (type) out.$exception_type = type;
  const list = source.$exception_list;
  if (!Array.isArray(list)) return out;
  const cleaned = list.map((entry) => scrubExceptionEntry(entry)).filter((entry) => entry !== null);
  if (cleaned.length > 0) out.$exception_list = cleaned;
  return out;
}

function scrubExceptionEntry(entry: unknown): Record<string, unknown> | null {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  const type = exceptionType(record.type);
  const frames = exceptionFrames(record.stacktrace);
  const cleaned: Record<string, unknown> = {};
  if (type) cleaned.type = type;
  if (frames.length > 0) cleaned.stacktrace = { frames };
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

function exceptionFrames(stacktrace: unknown): Array<Record<string, unknown>> {
  if (!stacktrace || typeof stacktrace !== "object") return [];
  const frames = (stacktrace as { frames?: unknown }).frames;
  if (!Array.isArray(frames)) return [];
  const cleaned: Array<Record<string, unknown>> = [];
  for (const frame of frames) {
    if (!frame || typeof frame !== "object") continue;
    const record = frame as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    const filename = fileOnly(record.filename);
    if (filename) next.filename = filename;
    if (typeof record.lineno === "number") next.lineno = record.lineno;
    if (typeof record.colno === "number") next.colno = record.colno;
    if (Object.keys(next).length > 0) cleaned.push(next);
  }
  return cleaned;
}

function exceptionType(value: unknown): string | null {
  return typeof value === "string" && EXCEPTION_TYPE_RE.test(value) ? value : null;
}

function fileOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.split("?")[0]?.split("#")[0] ?? "";
  if (!clean || clean.includes("@") || clean.length > 180) return null;
  return clean;
}

function sanitizeLocationValue(value: string, pathnameOnly: boolean): string {
  if (pathnameOnly) return sanitizePagePath(value);
  try {
    const url = new URL(value, POSTHOG_DEFAULT_API_HOST);
    return buildSafeAnalyticsPageLocation(url.origin, url.pathname);
  } catch {
    return sanitizePagePath(value);
  }
}

function scrubPersonSet(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const out: Record<string, unknown> = {};
  if (typeof value.signup_date === "string" && SIGNUP_DAY_RE.test(value.signup_date)) {
    out.signup_date = value.signup_date;
  }
  if (value.qa_synth === true) out.qa_synth = true;
  return Object.keys(out).length > 0 ? out : undefined;
}
