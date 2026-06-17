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

export interface ForwardingStatusBanner {
  show: boolean;
  title: string;
  status: string;
  classification: string;
  reason: string;
  recommendedNextStep: string;
}

export interface ForwardingStatusViewModel {
  state: "loading" | "offline" | "ready";
  /** Short headline string for the widget. */
  headline: string;
  /** Sub-headline / explanation. Empty string when none. */
  subheadline: string;
  rows: ForwardingStatusRow[];
  banner: ForwardingStatusBanner;
}

const HIDDEN_BANNER: ForwardingStatusBanner = {
  show: false,
  title: "",
  status: "",
  classification: "",
  reason: "",
  recommendedNextStep: "",
};

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
      banner: HIDDEN_BANNER,
    };
  }
  if (fetchState.state === "offline") {
    return {
      state: "offline",
      headline: OFFLINE_HEADLINE,
      subheadline: OFFLINE_SUB,
      rows: [],
      banner: HIDDEN_BANNER,
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

  if (s.last_forward_response_reason) {
    rows.push({
      key: "last_forward_response_reason",
      label: "Last reason",
      value: s.last_forward_response_reason,
      tone: "warn",
    });
  }

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

  rows.push({
    key: "malformed_line_count",
    label: "Malformed log lines",
    value: String(s.malformed_line_count),
    tone: s.malformed_line_count > 0 ? "warn" : "neutral",
  });

  if (s.latest_metrics) {
    const m = s.latest_metrics;
    const summary = [
      m.source ? `source=${m.source}` : null,
      m.vendor ? `vendor=${m.vendor}` : null,
      m.captured_at ? `captured_at=${m.captured_at}` : null,
      m.metric_keys.length > 0 ? `metrics=${m.metric_keys.join(",")}` : null,
    ]
      .filter((v): v is string => v != null)
      .join(" • ");
    if (summary) {
      rows.push({
        key: "latest_metrics",
        label: "Latest metrics",
        value: summary,
        tone: "neutral",
      });
    }
  }

  if (s.recommended_next_step) {
    rows.push({
      key: "recommended_next_step",
      label: "Recommended next step",
      value: s.recommended_next_step,
      tone: "warn",
    });
  }

  if (s.generated_at) {
    rows.push({
      key: "generated_at",
      label: "Report generated",
      value: s.generated_at,
      tone: "neutral",
    });
  }

  const headline = s.forwarding_ready
    ? "Local bridge ready to forward."
    : "Local bridge not ready to forward.";
  const sub = s.forwarding_ready
    ? "Verdant ingest webhook will be called for new EcoWitt readings."
    : "Set VERDANT_TENT_ID / VERDANT_INGEST_URL / VERDANT_BRIDGE_TOKEN in .env and restart the listener.";

  const failureDetected =
    s.forwarding_enabled === true &&
    ((typeof s.last_forward_status === "number" && s.last_forward_status >= 400) ||
      s.forward_failure_count > 0 ||
      s.last_forward_error != null ||
      s.last_forward_response_error != null);

  const banner: ForwardingStatusBanner = failureDetected
    ? {
        show: true,
        title: "EcoWitt ingest needs attention",
        status:
          s.last_forward_status == null ? "—" : String(s.last_forward_status),
        classification: s.last_forward_response_classification ?? "—",
        reason: s.last_forward_response_reason ?? "—",
        recommendedNextStep:
          s.recommended_next_step ??
          "Open the sanitized forwarding report below for next steps.",
      }
    : HIDDEN_BANNER;

  return { state: "ready", headline, subheadline: sub, rows, banner };
}
