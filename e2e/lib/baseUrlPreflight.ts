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
}

/**
 * A message naming why the base URL is not serving the app, or null when it
 * is. Callers throw the message so the run fails at once with the cause.
 */
export function describeUnservedE2EBaseUrl(probe: BaseUrlProbe): string | null {
  const noProject = probe.bodyText.includes(LOVABLE_NO_PROJECT_MARKER);
  const badStatus = probe.status === null || probe.status >= 400;
  if (!noProject && !badStatus) return null;

  let origin = probe.url;
  try {
    origin = new URL(probe.url).origin;
  } catch {
    // keep the raw value
  }
  const answered = probe.status === null ? "gave no response" : `answered HTTP ${probe.status}`;
  const detail = noProject ? ` ("${LOVABLE_NO_PROJECT_MARKER}.")` : "";
  return (
    `E2E_BASE_URL is not serving the Verdant app: ${origin} ${answered}${detail}. ` +
    "This is a configuration problem, not a sign-in failure. Point the E2E_BASE_URL and " +
    "E2E_GROW_1_PLANT_URL variables at a host that serves the app, then re-run."
  );
}
