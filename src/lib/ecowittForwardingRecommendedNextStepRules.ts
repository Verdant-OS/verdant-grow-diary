/**
 * Pure rules for the EcoWitt local forwarding "recommended next step"
 * surface. Deterministic, presenter-friendly. No side effects, no Supabase,
 * no fetches, no logging. UI components import this to derive copy without
 * embedding rule tables in JSX.
 *
 * Never recommends direct database edits, SQL, or raw payload inspection.
 */

import type {
  LocalForwardingFetchState,
  LocalForwardingStatus,
} from "@/lib/ecowittLocalForwardingStatus";

const SHARE_REPORT = "Share the sanitized forwarding report only.";

/** Public copy table — exported for tests/docs. */
export const NEXT_STEP_COPY = {
  offline:
    "EcoWitt local bridge not reachable on localhost:8787. Start the listener and refresh.",
  forwarding_disabled:
    "Forwarding is disabled in the bridge config. Enable forwarding in local .env and restart the listener.",
  ingest_url_missing:
    "Set VERDANT_INGEST_URL in local .env and restart the listener.",
  bridge_token_missing:
    "Set VERDANT_BRIDGE_TOKEN in local .env and restart the listener.",
  tent_id_missing:
    "Set VERDANT_TENT_ID in local .env and restart the listener.",
  tent_id_invalid:
    "VERDANT_TENT_ID is not a valid UUID. Replace it in local .env and restart the listener.",
  forwarding_not_ready:
    "Bridge is not ready to forward. Confirm .env values, then restart the listener.",
  token_revoked:
    "Bridge token was revoked. Rotate the token, update local .env, restart the listener, and retry one forward.",
  token_expired:
    "Bridge token expired. Generate a fresh token, update local .env, restart the listener, and retry one forward.",
  forbidden_tent:
    "Token is valid but not authorized for this tent. Confirm the token and configured tent belong to the same grow.",
  insert_required_field_missing: `Storage insert reached the database but a required field is missing. ${SHARE_REPORT}`,
  insert_source_constraint_failed:
    'Stored source failed the canonical source rule. Confirm EcoWitt transport source is remapped to stored source "live".',
  insert_check_failed: `A database check rejected the row. ${SHARE_REPORT}`,
  insert_column_mismatch: `Insert payload does not match the current database columns. ${SHARE_REPORT}`,
  insert_duplicate:
    "This appears to be a duplicate/idempotent reading. Usually safe; verify dedupe behavior before retrying.",
  insert_unknown: `Storage insert failed for an unknown sanitized reason. ${SHARE_REPORT}`,
  missing_reason:
    "Insert failed but no reason was returned. Confirm the deployed Edge Function is current and redeployed.",
  generic_failure:
    "Forwarding failed. Open the sanitized forwarding report below for next steps.",
  healthy:
    "Forwarding is healthy. Continue letting EcoWitt POST naturally.",
} as const;

export type RecommendedNextStepKind = keyof typeof NEXT_STEP_COPY;

export interface RecommendedNextStep {
  kind: RecommendedNextStepKind;
  text: string;
}

/**
 * Compute the most specific recommended next step given the current
 * fetch state and (optional) status. Never recommends SQL or direct
 * database edits.
 */
export function recommendForwardingNextStep(
  fetchState: LocalForwardingFetchState,
): RecommendedNextStep {
  if (fetchState.state === "loading") {
    return { kind: "generic_failure", text: NEXT_STEP_COPY.generic_failure };
  }
  if (fetchState.state === "offline") {
    return { kind: "offline", text: NEXT_STEP_COPY.offline };
  }
  const s = fetchState.status;
  return recommendForStatus(s);
}

export function recommendForStatus(
  s: LocalForwardingStatus,
): RecommendedNextStep {
  // Configuration gaps — surface before forwarding-specific errors.
  if (!s.forwarding_enabled) {
    return {
      kind: "forwarding_disabled",
      text: NEXT_STEP_COPY.forwarding_disabled,
    };
  }
  if (!s.ingest_url_configured) {
    return { kind: "ingest_url_missing", text: NEXT_STEP_COPY.ingest_url_missing };
  }
  if (!s.bridge_token_configured) {
    return {
      kind: "bridge_token_missing",
      text: NEXT_STEP_COPY.bridge_token_missing,
    };
  }
  if (!s.tent_id_configured) {
    return { kind: "tent_id_missing", text: NEXT_STEP_COPY.tent_id_missing };
  }
  if (!s.tent_id_valid) {
    return { kind: "tent_id_invalid", text: NEXT_STEP_COPY.tent_id_invalid };
  }

  // Classification-specific guidance.
  const classification = s.last_forward_response_classification?.toLowerCase() ?? "";
  if (classification === "token_revoked") {
    return { kind: "token_revoked", text: NEXT_STEP_COPY.token_revoked };
  }
  if (classification === "token_expired") {
    return { kind: "token_expired", text: NEXT_STEP_COPY.token_expired };
  }
  if (classification === "forbidden_tent") {
    return { kind: "forbidden_tent", text: NEXT_STEP_COPY.forbidden_tent };
  }

  if (classification === "storage_insert_failed") {
    const reason = s.last_forward_response_reason?.toLowerCase() ?? "";
    if (reason === "insert_required_field_missing") {
      return {
        kind: "insert_required_field_missing",
        text: NEXT_STEP_COPY.insert_required_field_missing,
      };
    }
    if (reason === "insert_source_constraint_failed") {
      return {
        kind: "insert_source_constraint_failed",
        text: NEXT_STEP_COPY.insert_source_constraint_failed,
      };
    }
    if (reason === "insert_check_failed") {
      return {
        kind: "insert_check_failed",
        text: NEXT_STEP_COPY.insert_check_failed,
      };
    }
    if (reason === "insert_column_mismatch") {
      return {
        kind: "insert_column_mismatch",
        text: NEXT_STEP_COPY.insert_column_mismatch,
      };
    }
    if (reason === "insert_duplicate") {
      return {
        kind: "insert_duplicate",
        text: NEXT_STEP_COPY.insert_duplicate,
      };
    }
    if (reason === "insert_unknown") {
      return { kind: "insert_unknown", text: NEXT_STEP_COPY.insert_unknown };
    }
    if (!reason) {
      return { kind: "missing_reason", text: NEXT_STEP_COPY.missing_reason };
    }
  }

  const hasFailure =
    (typeof s.last_forward_status === "number" && s.last_forward_status >= 400) ||
    s.forward_failure_count > 0 ||
    s.last_forward_error != null ||
    s.last_forward_response_error != null;

  if (!s.forwarding_ready && hasFailure) {
    return {
      kind: "forwarding_not_ready",
      text: NEXT_STEP_COPY.forwarding_not_ready,
    };
  }

  if (hasFailure) {
    return { kind: "generic_failure", text: NEXT_STEP_COPY.generic_failure };
  }

  return { kind: "healthy", text: NEXT_STEP_COPY.healthy };
}
