/**
 * Production error reporter (client only).
 *
 * The Sentry browser SDK is imported lazily and only when
 * `resolveErrorReportingConfig` says reporting is enabled: a DSN is set, the
 * build mode is production, and the hostname is a production host. Otherwise
 * this module never loads the SDK.
 *
 * `initErrorReporter` is idempotent and never rejects. `reportError` is a
 * no-op until the SDK is ready. `reportErrorWhenReady` starts the reporter
 * and then reports the one error a boundary caught.
 */
import { buildInfo } from "@/generated/buildInfo";
import {
  ERROR_REPORTING_DATA_COLLECTION,
  SEND_DEFAULT_PII,
  TRACES_SAMPLE_RATE,
  manualReportTags,
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
      // `as` keeps `sendDefaultPii` on the runtime object. Sentry 11.4 types
      // replaced that field with `dataCollection`; omitted categories default on.
      sentry.init({
        dsn: decision.dsn,
        environment: decision.environment,
        release: decision.release,
        sendDefaultPii: SEND_DEFAULT_PII,
        tracesSampleRate: TRACES_SAMPLE_RATE,
        dataCollection: ERROR_REPORTING_DATA_COLLECTION,
        integrations: (defaults) => withoutExcludedIntegrations(defaults),
        beforeSend: (event) => scrubEvent(event),
        beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
      } as Parameters<SentryModule["init"]>[0]);
      state = { status: "ready", sentry };
    })
    .catch(() => {
      state = { status: "failed" };
    });
  state = { status: "loading", decision, promise };
  return promise;
}

/** Reports one caught error. No-op unless the SDK is ready. Never throws. */
export function reportError(error: unknown, context?: ManualReportContext): void {
  if (state.status !== "ready") return;
  try {
    state.sentry.captureException(normalizeCaughtError(error), {
      tags: manualReportTags(context),
    });
  } catch {
    // Reporting must not create a second failure.
  }
}

/**
 * Starts the reporter if needed, then reports this one error. Used by the root
 * error boundary and the route error component.
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
