/**
 * ecowittLiveIngestVerifiedRules — pure helper that classifies the
 * Operator-Mode "Live Ingest Verified" status marker from the local
 * EcoWitt bridge's sanitized forwarding-status payload.
 *
 * Hard constraints:
 *  - Pure, deterministic, no I/O.
 *  - Read-only. No writes, no Supabase, no AI, no Action Queue.
 *  - Never returns tokens, ingest URLs, raw payload, Authorization headers,
 *    PASSKEY, or service-role markers — only short, safe operator copy.
 *  - Uses the canonical STALE_THRESHOLD_MS (30 minutes) so the marker
 *    matches the rest of the sensor-truth stack.
 */
import type {
  LocalForwardingFetchState,
  LocalForwardingStatus,
} from "@/lib/ecowittLocalForwardingStatus";
import { STALE_THRESHOLD_MS } from "@/lib/sensorReadingNormalizationRules";

export type LiveIngestVerifiedState =
  | "loading"
  | "offline"
  | "not_ready"
  | "waiting_for_first_reading"
  | "failed"
  | "non_live_source"
  | "stale"
  | "verified";

export interface LiveIngestVerifiedMarker {
  show: boolean;
  state: LiveIngestVerifiedState;
  /** Short headline rendered in the marker. */
  title: string;
  /** Optional one-line explanation. Empty string when none. */
  detail: string;
  /** "live", "manual", "demo", "csv", "stale", "invalid" or null. */
  source: string | null;
  /** ISO-8601 captured_at of latest_metrics, when present. */
  capturedAt: string | null;
  /** Tone hint for the UI badge. */
  tone: "neutral" | "ok" | "warn" | "error";
}

const HIDDEN: LiveIngestVerifiedMarker = Object.freeze({
  show: false,
  state: "loading",
  title: "",
  detail: "",
  source: null,
  capturedAt: null,
  tone: "neutral",
});

function isFresh(capturedAt: string | null, nowMs: number): boolean {
  if (!capturedAt) return false;
  const t = Date.parse(capturedAt);
  if (!Number.isFinite(t)) return false;
  if (t - nowMs > 60_000) return false; // future-dated > 1m skew → reject
  return nowMs - t <= STALE_THRESHOLD_MS;
}

/**
 * Classify the live-ingest-verified marker from a fetch state.
 *
 * `nowMs` is injectable for deterministic tests; defaults to Date.now().
 */
export function classifyLiveIngestVerifiedMarker(
  fetchState: LocalForwardingFetchState,
  nowMs: number = Date.now(),
): LiveIngestVerifiedMarker {
  if (fetchState.state === "loading") {
    return HIDDEN;
  }
  if (fetchState.state === "offline") {
    return {
      show: true,
      state: "offline",
      title: "Local bridge offline",
      detail: "Start the EcoWitt listener on localhost:8787 to verify ingest.",
      source: null,
      capturedAt: null,
      tone: "neutral",
    };
  }

  const s: LocalForwardingStatus = fetchState.status;

  if (!s.forwarding_ready || !s.forwarding_enabled) {
    return {
      show: true,
      state: "not_ready",
      title: "Forwarding not ready",
      detail: "Bridge is reachable but not configured to forward.",
      source: null,
      capturedAt: null,
      tone: "warn",
    };
  }

  const failureDetected =
    (typeof s.last_forward_status === "number" && s.last_forward_status >= 400) ||
    s.forward_failure_count > s.forward_success_count ||
    s.last_forward_response_error != null ||
    s.last_forward_error != null;

  if (failureDetected) {
    return {
      show: true,
      state: "failed",
      title: "Last forward failed",
      detail: "See the failure banner for the next step.",
      source: null,
      capturedAt: null,
      tone: "error",
    };
  }

  if (s.forward_success_count <= 0 || !s.latest_metrics) {
    return {
      show: true,
      state: "waiting_for_first_reading",
      title: "Waiting for first live EcoWitt reading",
      detail: "Bridge is ready. No successful forward observed yet.",
      source: null,
      capturedAt: null,
      tone: "neutral",
    };
  }

  const source = (s.latest_metrics.source ?? "").trim().toLowerCase() || null;
  const capturedAt = s.latest_metrics.captured_at;

  if (source !== "live") {
    return {
      show: true,
      state: "non_live_source",
      title: "Latest reading is not a live source",
      detail: source
        ? `Source = ${source}. Verified marker requires source=live.`
        : "Source is unknown. Verified marker requires source=live.",
      source,
      capturedAt,
      tone: "warn",
    };
  }

  if (s.last_forward_status !== 200) {
    return {
      show: true,
      state: "failed",
      title: "Last forward did not return HTTP 200",
      detail: "Verified marker requires a successful 200 response.",
      source,
      capturedAt,
      tone: "error",
    };
  }

  if (!isFresh(capturedAt, nowMs)) {
    return {
      show: true,
      state: "stale",
      title: "Live ingest last seen, but reading is stale",
      detail: "Latest captured_at is past the freshness window.",
      source,
      capturedAt,
      tone: "warn",
    };
  }

  return {
    show: true,
    state: "verified",
    title: "Live ingest verified",
    detail: "Local bridge forwarded a fresh live EcoWitt reading.",
    source,
    capturedAt,
    tone: "ok",
  };
}
