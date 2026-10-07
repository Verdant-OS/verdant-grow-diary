/**
 * Production error reporter (client only).
 *
 * Thin side-effect layer over `errorReportingRules.ts`. The Sentry browser SDK
 * is imported lazily and only when the rules say reporting is enabled, so a
 * build without `VITE_SENTRY_DSN` ships no reporter code path at all beyond
 * this file and pays nothing at runtime.
 *
 * Contract:
 * - `initErrorReporter()` is idempotent and safe to call on every render. It
 *   returns a promise that settles once the reporter is ready, disabled or
 *   failed; it never rejects.
 * - `reportError()` is a no-op until the SDK is ready; nothing is queued, so a
 *   burst of errors before init can never be replayed later out of context.
 * - `reportErrorWhenReady()` is for the two error surfaces. They can fire before
 *   (or instead of) the root effect that normally starts the reporter, so they
 *   start it themselves and report the one error they caught once it settles.
 * - Reporting is independent of the analytics-consent banner on purpose: it
 *   carries no identity and exists to keep the product working, not to measure
 *   growers. See the privacy posture in `errorReportingRules.ts`.
 */
import { buildInfo } from "@/generated/buildInfo";
import {
  buildManualReportContext,
  normalizeCaughtError,
  resolveErrorReportingConfig,
  scrubBreadcrumb,
  scrubEvent,
  withoutExcludedIntegrations,
  type ErrorReportingDecision,
  type ManualReportContext,
} from "@/lib/errorReportingRules";

type SentryModule = typeof import("@sentry/browser");

type ReporterState =
  | { status: "idle" }
  | { status: "disabled"; decision: ErrorReportingDecision }
  | { status: "loading"; decision: ErrorReportingDecision; promise: Promise<void> }
  | { status: "ready"; sentry: SentryModule }
  | { status: "failed" };

let state: ReporterState = { status: "idle" };

export function getErrorReporterStatus(): ReporterState["status"] {
  return state.status;
}

/** Test seam: resets module state. Not used by application code. */
export function __resetErrorReporterForTests(): void {
  state = { status: "idle" };
}

function currentDecision(): ErrorReportingDecision {
  return resolveErrorReportingConfig({
    dsn: import.meta.env.VITE_SENTRY_DSN as string | undefined,
    hostname: typeof window === "undefined" ? undefined : window.location.hostname,
    release: buildInfo.version,
    mode: import.meta.env.MODE,
  });
}

/**
 * Idempotent. Loads and initialises the SDK once when the rules allow it.
 * Resolves when the reporter is ready, disabled or failed; never rejects.
 */
export function initErrorReporter(
  loadSdk: () => Promise<SentryModule> = () => import("@sentry/browser"),
): Promise<void> {
  if (state.status === "loading") return state.promise;
  if (state.status !== "idle") return Promise.resolve();
  const decision = currentDecision();
  if (!decision.enabled) {
    state = { status: "disabled", decision };
    return Promise.resolve();
  }
  const promise = loadSdk()
    .then((sentry) => {
      sentry.init({
        dsn: decision.dsn,
        environment: decision.environment,
        release: decision.release,
        // v11 replaced `sendDefaultPii` with per-category data collection.
        // Everything identity- or content-bearing is off; beforeSend scrubs the rest.
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
        },
        tracesSampleRate: 0,
        maxBreadcrumbs: 20,
        // No release-health sessions: they carry a session id and bypass beforeSend.
        integrations: (defaults) => withoutExcludedIntegrations(defaults),
        beforeSend: (event) => scrubEvent(event),
        beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
      });
      state = { status: "ready", sentry };
    })
    .catch(() => {
      // A blocked or failed SDK fetch must never affect the app.
      state = { status: "failed" };
    });
  state = { status: "loading", decision, promise };
  return promise;
}

/**
 * Reports an error a boundary caught. No-op unless the SDK is ready. Never
 * throws: the caller is already on an error path.
 */
export function reportError(error: unknown, context?: ManualReportContext): void {
  if (state.status !== "ready") return;
  try {
    const { tags, extra } = buildManualReportContext(context);
    state.sentry.captureException(normalizeCaughtError(error), { tags, extra });
  } catch {
    // Swallow: reporting must not create a second failure.
  }
}

/**
 * Starts the reporter if needed, then reports this one error. Used by the root
 * error boundary and the route error component, which can run before the root
 * effect initialises the reporter (or, for a root-route error, without that
 * effect ever running). Only the caught error waits; nothing else is queued.
 */
export function reportErrorWhenReady(
  error: unknown,
  context?: ManualReportContext,
  loadSdk?: () => Promise<SentryModule>,
): Promise<void> {
  try {
    return initErrorReporter(loadSdk).then(() => reportError(error, context));
  } catch {
    return Promise.resolve();
  }
}
