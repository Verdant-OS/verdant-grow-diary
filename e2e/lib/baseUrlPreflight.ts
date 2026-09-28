/**
 * baseUrlPreflight — tell a misconfigured E2E_BASE_URL apart from a broken
 * sign-in.
 *
 * QA 2026-09-24 (#1683): the Quick Log smoke's auth setup timed out waiting
 * for `#signin-email` because `vars.E2E_BASE_URL` pointed at a Lovable host
 * that answers HTTP 404 "No Lovable project found at this address." The
 * failure read as a sign-in problem; it was configuration.
 *
 * Pure: no Playwright, no network, no clock.
 */

/** Text Lovable serves on a host with no project behind it. */
export const LOVABLE_NO_PROJECT_MARKER = "No Lovable project found at this address";

export interface BaseUrlProbe {
  /** Final URL of the document request (after redirects). */
  readonly url: string;
  /** HTTP status of the document, or null when there was no response. */
  readonly status: number | null;
  /** Visible text of the loaded page. */
  readonly bodyText: string;
  /** Document title of the loaded page. */
  readonly title?: string;
  /** Message of a navigation that threw (DNS, TLS, timeout) instead of answering. */
  readonly navigationError?: string;
}

/** Every Verdant /auth page names the app in its title and heading. */
const VERDANT_LANDMARK = /verdant/i;

/**
 * A message naming why the base URL is not serving the app, or null when it
 * is. Callers throw the message so the run fails at once with the cause.
 */
export function describeUnservedE2EBaseUrl(probe: BaseUrlProbe): string | null {
  const noProject = probe.bodyText.includes(LOVABLE_NO_PROJECT_MARKER);
  const badStatus = probe.status === null || probe.status >= 400;
  // A 2xx/3xx page must also be Verdant's: a wrong host or soft-404 would
  // otherwise pass here and fail later as a #signin-email timeout, or not at
  // all when cached auth from that origin is reused (Codex review on #1683).
  const notVerdant =
    !VERDANT_LANDMARK.test(probe.bodyText) && !VERDANT_LANDMARK.test(probe.title ?? "");
  if (!noProject && !badStatus && !notVerdant) return null;

  let origin = probe.url;
  try {
    origin = new URL(probe.url).origin;
  } catch {
    // keep the raw value
  }
  const answered = probe.navigationError
    ? `could not be loaded (${probe.navigationError.split("\n")[0].trim()})`
    : probe.status === null
      ? "gave no response"
      : `answered HTTP ${probe.status}`;
  const detail = noProject
    ? ` ("${LOVABLE_NO_PROJECT_MARKER}.")`
    : badStatus
      ? ""
      : ', but its /auth page shows no "Verdant" title or heading';
  return (
    `E2E_BASE_URL is not serving the Verdant app: ${origin} ${answered}${detail}. ` +
    "This is a configuration problem, not a sign-in failure. Point the E2E_BASE_URL and " +
    "E2E_GROW_1_PLANT_URL variables at a host that serves the app, then re-run."
  );
}

/**
 * A message when cached auth state cannot be used against the current base
 * URL, or null when it can (Codex review on #1683). `authedTest` injects the
 * saved sessionStorage only on the origin it was saved from, so a snapshot
 * from another origin would run every authenticated spec logged out. An
 * unreadable snapshot, or one with no origin, never matches.
 */
export function describeCachedAuthOriginMismatch(input: {
  /** Raw contents of e2e/.auth/session-storage.json. */
  readonly savedSnapshot: string;
  /** Final URL after probing /auth on E2E_BASE_URL. */
  readonly currentUrl: string;
}): string | null {
  let savedOrigin: string | null = null;
  try {
    const parsed = JSON.parse(input.savedSnapshot) as { origin?: unknown };
    savedOrigin = typeof parsed?.origin === "string" && parsed.origin ? parsed.origin : null;
  } catch {
    savedOrigin = null;
  }
  let currentOrigin = input.currentUrl;
  try {
    currentOrigin = new URL(input.currentUrl).origin;
  } catch {
    // keep the raw value
  }
  if (savedOrigin !== null && savedOrigin === currentOrigin) return null;
  return (
    `Cached auth state in e2e/.auth/ was saved on ${savedOrigin ?? "an unknown origin"}, ` +
    `but E2E_BASE_URL now serves ${currentOrigin}. Its session would not be injected there, so ` +
    "authenticated specs would run logged out. Delete the e2e/.auth/ directory, or set " +
    "E2E_TEST_EMAIL / E2E_TEST_PASSWORD so this setup signs in again on this origin."
  );
}
