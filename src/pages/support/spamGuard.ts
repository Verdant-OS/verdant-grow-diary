// Lightweight, client-side spam guard for public support forms.
// Not a security boundary — reduces casual bot noise and accidental double-submits.
// Server-side rate limiting is not available; treat this as best-effort only.

export const HONEYPOT_FIELD = "website_url" as const;
export const MIN_FILL_MS = 2500;
export const COOLDOWN_MS = 60_000;

export type SpamCheckResult =
  | { ok: true }
  | { ok: false; reason: "honeypot" | "too_fast" | "duplicate" | "cooldown"; message: string };

export function checkSpam(params: {
  honeypotValue: string;
  formOpenedAt: number;
  now?: number;
  storageKey: string;
  contentFingerprint: string;
}): SpamCheckResult {
  const now = params.now ?? Date.now();

  if (params.honeypotValue && params.honeypotValue.trim().length > 0) {
    return {
      ok: false,
      reason: "honeypot",
      message: "Submission blocked. If you're human, please contact support directly.",
    };
  }

  if (now - params.formOpenedAt < MIN_FILL_MS) {
    return {
      ok: false,
      reason: "too_fast",
      message: "That was quick — take a moment to review your submission, then try again.",
    };
  }

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(params.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { at: number; fp: string };
        if (parsed && typeof parsed.at === "number") {
          if (parsed.fp === params.contentFingerprint && now - parsed.at < COOLDOWN_MS * 5) {
            return {
              ok: false,
              reason: "duplicate",
              message:
                "Looks like this exact message was just sent. If it didn't go through, wait a moment and edit it before resending.",
            };
          }
          if (now - parsed.at < COOLDOWN_MS) {
            const secs = Math.ceil((COOLDOWN_MS - (now - parsed.at)) / 1000);
            return {
              ok: false,
              reason: "cooldown",
              message: `Please wait ${secs}s before sending another message.`,
            };
          }
        }
      }
    } catch {
      // ignore storage errors (private mode, quota, etc.) — fail open
    }
  }

  return { ok: true };
}

export function recordSubmission(storageKey: string, contentFingerprint: string, now: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ at: now, fp: contentFingerprint }));
  } catch {
    // ignore
  }
}

export function fingerprint(input: string): string {
  // Small, non-cryptographic hash — enough to detect identical resubmits.
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
