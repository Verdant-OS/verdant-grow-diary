/**
 * View model for the local EcoWitt forwarding status widget. Pure /
 * presenter-friendly. Maps a raw fetch state into a small list of
 * label/value pairs the UI can render without making decisions itself.
 */

import type {
  LocalForwardingFetchState,
  LocalForwardingStatus,
} from "@/lib/ecowittLocalForwardingStatus";

export interface ForwardingStatusRow {
  key: string;
  label: string;
  value: string;
  tone: "neutral" | "ok" | "warn" | "error";
}

export interface ForwardingStatusViewModel {
  state: "loading" | "offline" | "ready";
  /** Short headline string for the widget. */
  headline: string;
  /** Sub-headline / explanation. Empty string when none. */
  subheadline: string;
  rows: ForwardingStatusRow[];
}

const OFFLINE_HEADLINE = "EcoWitt local bridge not reachable on localhost:8787.";
const OFFLINE_SUB =
  "Start the listener (start-listener-windows.ps1) to see forwarding health here. Nothing is sent to Verdant from this widget.";

export function buildForwardingStatusViewModel(
  fetchState: LocalForwardingFetchState,
): ForwardingStatusViewModel {
  if (fetchState.state === "loading") {
    return {
      state: "loading",
      headline: "Checking local EcoWitt bridge…",
      subheadline: "",
      rows: [],
    };
  }
  if (fetchState.state === "offline") {
    return {
      state: "offline",
      headline: OFFLINE_HEADLINE,
      subheadline: OFFLINE_SUB,
      rows: [],
    };
  }
  const s: LocalForwardingStatus = fetchState.status;
  const rows: ForwardingStatusRow[] = [];

  rows.push({
    key: "forwarding_ready",
    label: "Forwarding ready",
    value: s.forwarding_ready ? "yes" : "no",
    tone: s.forwarding_ready ? "ok" : "warn",
  });

  rows.push({
    key: "last_forward_status",
    label: "Last HTTP status",
    value: s.last_forward_status == null ? "—" : String(s.last_forward_status),
    tone:
      s.last_forward_status == null
        ? "neutral"
        : s.last_forward_status >= 200 && s.last_forward_status < 300
          ? "ok"
          : "error",
  });

  rows.push({
    key: "last_forward_response_classification",
    label: "Last classification",
    value: s.last_forward_response_classification ?? "—",
    tone: s.last_forward_response_classification ? "warn" : "neutral",
  });

  rows.push({
    key: "retry_count",
    label: "Retries (since restart)",
    value: `${s.retry_count} / max ${s.max_retry_attempts}`,
    tone: s.retry_count > 0 ? "warn" : "neutral",
  });

  if (s.last_retry_error) {
    rows.push({
      key: "last_retry_error",
      label: "Last retry error",
      value: s.last_retry_error,
      tone: "warn",
    });
  }

  rows.push({
    key: "forward_success_count",
    label: "Successful forwards",
    value: String(s.forward_success_count),
    tone: s.forward_success_count > 0 ? "ok" : "neutral",
  });

  rows.push({
    key: "forward_failure_count",
    label: "Failed forwards",
    value: String(s.forward_failure_count),
    tone: s.forward_failure_count > 0 ? "error" : "neutral",
  });

  const headline = s.forwarding_ready
    ? "Local bridge ready to forward."
    : "Local bridge not ready to forward.";
  const sub = s.forwarding_ready
    ? "Verdant ingest webhook will be called for new EcoWitt readings."
    : "Set VERDANT_TENT_ID / VERDANT_INGEST_URL / VERDANT_BRIDGE_TOKEN in .env and restart the listener.";

  return { state: "ready", headline, subheadline: sub, rows };
}
