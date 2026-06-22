/**
 * actionQueueReturnLinkRules — pure helpers that build and parse a safe
 * `actionsReturn` query param. Used to round-trip a grower from
 * /actions → /timeline?highlight=… → back to the exact /actions URL
 * state they jumped from.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no AI calls.
 *  - Only allow-listed /actions query keys are preserved. Anything else
 *    (raw IDs, internal back-pointer tokens, secrets, raw payloads,
 *    bridge tokens, service keys) is dropped.
 *  - The encoded value is ALWAYS a relative path that starts with
 *    `/actions`. Absolute URLs, protocol URLs (http://, https://,
 *    javascript:, data:, vbscript:, file:), schema-relative URLs
 *    (`//evil`), and anything else are rejected → `null`.
 *  - Parsing returns `null` for malformed input; never throws.
 *  - Visible callers must treat `null` as "no link" and render a calm
 *    fallback (or hide the affordance).
 */

export const ACTIONS_RETURN_PARAM = "actionsReturn";

/** Allow-listed /actions query keys that survive the round-trip. */
export const ACTIONS_RETURN_ALLOWED_KEYS = [
  "q",
  "status",
  "trace",
  "page",
  "pageSize",
  "view",
  "growId",
] as const;

export type ActionsReturnAllowedKey =
  (typeof ACTIONS_RETURN_ALLOWED_KEYS)[number];

const ALLOWED_SET: ReadonlySet<string> = new Set(ACTIONS_RETURN_ALLOWED_KEYS);

/** Max characters preserved per single param value. Prevents bloat. */
export const ACTIONS_RETURN_VALUE_MAX_LEN = 80;
/** Max characters for the entire encoded relative path. */
export const ACTIONS_RETURN_PATH_MAX_LEN = 512;

function sanitizeValue(raw: string): string {
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").slice(
    0,
    ACTIONS_RETURN_VALUE_MAX_LEN,
  );
}

/**
 * Build a safe `/actions?…` relative path from the current /actions
 * URLSearchParams. Only allow-listed keys are included. Returns
 * `/actions` (no query) if nothing safe is present.
 */
export function buildActionsReturnRelativePath(
  current: URLSearchParams | null | undefined,
): string {
  const out = new URLSearchParams();
  if (current) {
    for (const key of ACTIONS_RETURN_ALLOWED_KEYS) {
      const v = current.get(key);
      if (v == null) continue;
      const cleaned = sanitizeValue(v);
      if (cleaned === "") continue;
      out.set(key, cleaned);
    }
  }
  const qs = out.toString();
  const path = qs ? `/actions?${qs}` : "/actions";
  return path.length > ACTIONS_RETURN_PATH_MAX_LEN ? "/actions" : path;
}

/**
 * Returns true if the candidate is a safe internal relative path that
 * starts with `/actions` (and only `/actions` — never `/actions-evil`
 * or `/actionsfoo`). Rejects protocol URLs, schema-relative URLs,
 * javascript: payloads, and anything malformed.
 */
export function isSafeActionsReturnPath(
  candidate: unknown,
): candidate is string {
  if (typeof candidate !== "string") return false;
  if (candidate.length === 0) return false;
  if (candidate.length > ACTIONS_RETURN_PATH_MAX_LEN) return false;
  // Reject control chars early.
  if (/[\u0000-\u001F\u007F]/.test(candidate)) return false;
  // Must be a relative path beginning with `/actions` followed by `?`,
  // `#`, end-of-string, or `/` boundary.
  if (!/^\/actions(?:$|[?#])/.test(candidate)) return false;
  // Reject protocol / schema-relative URLs explicitly even though the
  // regex above already excludes them. Belt-and-suspenders.
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) return false;
  if (candidate.startsWith("//")) return false;
  return true;
}

/**
 * Parse the raw `actionsReturn` query value. Returns the safe relative
 * path, or `null` for missing/unsafe values.
 */
export function parseActionsReturnParam(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  // URLSearchParams.get already URL-decodes; callers may also pass an
  // already-decoded value. Re-validate either way.
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!isSafeActionsReturnPath(decoded)) return null;
  return decoded;
}

export const BACK_TO_ACTIONS_LABEL = "Back to Actions";
export const BACK_TO_ACTIONS_TESTID = "timeline-back-to-actions";
export const BACK_TO_ACTIONS_FALLBACK_HREF = "/actions";

/**
 * Resolve the href for the "Back to Actions" link. Falls back to
 * `/actions` when no safe return path is provided. Callers may choose
 * to hide the affordance entirely when this returns the fallback —
 * `wasProvided` makes that decision explicit.
 */
export function resolveBackToActionsHref(
  raw: string | null | undefined,
): { href: string; wasProvided: boolean } {
  const parsed = parseActionsReturnParam(raw ?? null);
  if (parsed) return { href: parsed, wasProvided: true };
  return { href: BACK_TO_ACTIONS_FALLBACK_HREF, wasProvided: false };
}
