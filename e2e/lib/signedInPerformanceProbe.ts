import type { Page } from "@playwright/test";
import {
  buildPerformanceReceipt,
  performanceContextIssue,
  PERFORMANCE_ORIGIN,
  readPublicDeploymentIdentity,
  type PerformanceContext,
  type PerformanceReceipt,
  type PublicDeploymentIdentity,
} from "./signedInPerformanceRules";

export async function readLivePerformanceIdentity(
  page: Pick<Page, "request">,
): Promise<PublicDeploymentIdentity | null> {
  try {
    // Public build metadata only; no session, headers, payload or credentials in receipts.
    const response = await page.request.get(PERFORMANCE_ORIGIN + "/version.json", {
      timeout: 10_000,
      maxRedirects: 0,
    });
    if (response.status() !== 200) return null;
    return readPublicDeploymentIdentity(await response.json(), response.url(), response.status());
  } catch {
    return null;
  }
}

export async function measureSignedInPerformance(
  context: PerformanceContext,
  dependencies: {
    readIdentity: () => Promise<PublicDeploymentIdentity | null>;
    assertReady?: () => Promise<void>;
    assertComplete?: () => Promise<void>;
    run: () => Promise<void>;
    clock?: () => number;
  },
): Promise<{ receipt: PerformanceReceipt; error: unknown | null }> {
  let before: PublicDeploymentIdentity | null = null;
  let after: PublicDeploymentIdentity | null = null;
  let startedMs: number | null = null;
  let finishedMs: number | null = null;
  let confirmed: boolean | null = null;
  let error: unknown | null = null;
  const result = () => ({
    receipt: buildPerformanceReceipt({
      ...context,
      before,
      after,
      startedMs,
      finishedMs,
      confirmed,
    }),
    error,
  });
  if (performanceContextIssue(context)) return result();
  before = await dependencies.readIdentity().catch(() => null);
  if (
    !before ||
    before.origin !== PERFORMANCE_ORIGIN ||
    before.dirty !== false ||
    before.commit !== context.expectedSha
  )
    return result();
  try {
    // Recheck write preconditions after metadata I/O, outside the measured interval.
    await dependencies.assertReady?.();
  } catch (cause) {
    return {
      receipt: { ...result().receipt, reason: "operation_precondition_failed" },
      error: cause,
    };
  }
  const clock = dependencies.clock ?? (() => performance.now());
  const tick = () => {
    try {
      return clock();
    } catch {
      return NaN;
    }
  };
  startedMs = tick();
  if (!Number.isFinite(startedMs) || startedMs < 0) {
    after = before;
    return result();
  }
  try {
    await dependencies.run();
    confirmed = true;
  } catch (cause) {
    confirmed = false;
    error = cause;
  } finally {
    finishedMs = tick();
  }
  after = await dependencies.readIdentity().catch(() => null);
  try {
    // Account continuity and attempted writes invalidate readiness even if
    // the visible control succeeded. Never include this check in elapsed time.
    await dependencies.assertComplete?.();
  } catch (cause) {
    return {
      receipt: {
        ...result().receipt,
        status: "BLOCKED",
        reason: "operation_postcondition_failed",
        elapsedMs: null,
      },
      error: cause,
    };
  }
  return result();
}
