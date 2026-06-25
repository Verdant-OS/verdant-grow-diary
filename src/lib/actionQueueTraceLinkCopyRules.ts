/**
 * actionQueueTraceLinkCopyRules — pure helpers that derive a safe,
 * copyable Action Queue trace link from a parsed highlight token (or
 * from a diary entry's `details` column), plus a small clipboard
 * wrapper that NEVER throws.
 *
 * Hard constraints:
 *  - Pure logic. The clipboard wrapper is the only side-effect and it
 *    only writes to the user's local clipboard — no network, no
 *    Supabase, no secrets/raw payloads/tokens, no device control.
 *  - Visible labels never include raw IDs.
 *  - Invalid/malformed tokens return null and render nothing.
 *  - Same-origin absolute URLs are produced when `window.location.origin`
 *    is available so the copied URL is shareable; otherwise we fall
 *    back to a relative path. Cross-origin URLs are never produced.
 */

import { parseActionsReturnParam } from "@/lib/actionQueueReturnLinkRules";

export const COPY_TRACE_LINK_LABEL = "Copy trace link";
export const COPY_TRACE_LINK_SUCCESS_COPY = "Trace link copied";
export const COPY_TRACE_LINK_FAILURE_COPY = "Could not copy trace link";
export const COPY_TRACE_LINK_TESTID = "copy-trace-link-button";
export const COPY_TRACE_LINK_STATUS_TESTID = "copy-trace-link-status";

const HIGHLIGHT_TOKEN_RE =
  /^action-queue:([A-Za-z0-9_-]{1,64}):(approved|rejected)$/;
const HIGHLIGHT_PARAM = "highlight";

export interface CopyableTraceLink {
  /** Absolute same-origin URL when origin is known; otherwise relative. */
  url: string;
  /** The relative `/actions?…` path embedded in the URL. */
  relativePath: string;
  /** Verbatim highlight token; safe to ship in the URL. */
  highlight: string;
}

export interface BuildCopyableTraceLinkOptions {
  /** Optional safe actionsReturn path (e.g. `/actions?status=approved`). */
  actionsReturn?: string | null;
  /**
   * Origin override for tests (e.g. `https://verdantgrowdiary.com`).
   * Defaults to `window.location.origin` when available.
   */
  origin?: string | null;
}

function resolveOrigin(override?: string | null): string | null {
  if (typeof override === "string" && /^https?:\/\//.test(override)) {
    return override.replace(/\/+$/, "");
  }
  if (override === null) return null;
  if (typeof window !== "undefined") {
    try {
      const o = window.location?.origin;
      if (typeof o === "string" && /^https?:\/\//.test(o)) return o;
    } catch {
      // ignore
    }
  }
  return null;
}

function buildRelativePath(
  highlight: string,
  actionsReturn: string | null | undefined,
): string {
  // If a safe actionsReturn is supplied, MERGE the highlight into it so
  // the operator returns to their exact /actions state AND the row
  // stays marked. Strip any pre-existing `highlight` so it cannot
  // conflict with the canonical token.
  const safeReturn = parseActionsReturnParam(actionsReturn ?? null);
  if (safeReturn) {
    const [path, search = ""] = safeReturn.split("?");
    const qs = new URLSearchParams(search);
    qs.delete(HIGHLIGHT_PARAM);
    qs.set(HIGHLIGHT_PARAM, highlight);
    return `${path}?${qs.toString()}`;
  }
  return `/actions?${HIGHLIGHT_PARAM}=${encodeURIComponent(highlight)}`;
}

/**
 * Build a copyable trace link from a verbatim highlight token. Returns
 * null for malformed tokens. Never throws.
 */
export function buildCopyableTraceLinkFromHighlight(
  rawHighlight: string | null | undefined,
  options: BuildCopyableTraceLinkOptions = {},
): CopyableTraceLink | null {
  if (typeof rawHighlight !== "string") return null;
  if (!HIGHLIGHT_TOKEN_RE.test(rawHighlight)) return null;
  const relativePath = buildRelativePath(rawHighlight, options.actionsReturn);
  const origin = resolveOrigin(options.origin);
  const url = origin ? `${origin}${relativePath}` : relativePath;
  return { url, relativePath, highlight: rawHighlight };
}

export interface DiaryTraceDetailsLike {
  kind?: unknown;
  idempotency_key?: unknown;
}

/**
 * Same as `buildCopyableTraceLinkFromHighlight` but reads the token
 * from a diary entry's `details` column. Returns null unless the
 * entry is an `action_queue_trace` with a safely shaped key.
 */
export function buildCopyableTraceLinkFromDiaryDetails(
  details: DiaryTraceDetailsLike | null | undefined,
  options: BuildCopyableTraceLinkOptions = {},
): CopyableTraceLink | null {
  if (!details || typeof details !== "object") return null;
  if ((details as { kind?: unknown }).kind !== "action_queue_trace") return null;
  const key = (details as { idempotency_key?: unknown }).idempotency_key;
  if (typeof key !== "string") return null;
  return buildCopyableTraceLinkFromHighlight(key, options);
}

export type CopyTraceLinkResult = "success" | "failure";

/**
 * Write the trace link to the user's clipboard. Never throws.
 * Returns "failure" when clipboard is unavailable or the write rejects.
 */
export async function copyTraceLinkToClipboard(
  url: string,
  clipboard?: { writeText: (value: string) => Promise<void> } | null,
): Promise<CopyTraceLinkResult> {
  const target =
    clipboard ??
    (typeof navigator !== "undefined" &&
    typeof (navigator as Navigator).clipboard?.writeText === "function"
      ? (navigator as Navigator).clipboard
      : null);
  if (!target) return "failure";
  if (typeof url !== "string" || url.length === 0) return "failure";
  try {
    await target.writeText(url);
    return "success";
  } catch {
    return "failure";
  }
}
