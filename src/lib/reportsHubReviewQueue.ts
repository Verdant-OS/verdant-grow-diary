/**
 * reportsHubReviewQueue — pure helper that builds the "What to review next"
 * priority list for the Grow Learning Hub.
 *
 * SAFETY / SCOPE:
 *  - Pure, deterministic. No I/O, React, DB, network, or device control.
 *  - Display-only. Never mutates any record.
 *  - Copy stays observational. Never claims an action "fixed", "healed",
 *    "caused", "guaranteed", or made anything "healthy". Never ranks items
 *    as "best" / "worst".
 *  - Priority/ranking lives here, not in JSX.
 */
import {
  actionDetailPath,
  alertDetailPath,
  alertsPath,
  growDetailPath,
} from "@/lib/routes";

export const STALE_SENSOR_THRESHOLD_MS = 24 * 60 * 60 * 1000;
export const MAX_REVIEW_ITEMS = 4;

export type ReportsReviewItemId =
  | "missing_outcome"
  | "open_alerts"
  | "stale_sensor"
  | "low_sample_learning";

export interface ReportsReviewItem {
  id: ReportsReviewItemId;
  title: string;
  description: string;
  href: string;
  hrefLabel: string;
}

export interface ReportsReviewQueueInput {
  growId: string;
  pendingOutcomeReviewCount: number;
  firstPendingActionId: string | null;
  alertsOpen: number;
  firstOpenAlertId: string | null;
  latestSensorCapturedAt: string | null;
  recentSensorReadingCount: number;
  lowSampleLearningGroups: number;
  /** ms since epoch; defaults to Date.now(). Injectable for tests. */
  now?: number;
}

export interface ReportsReviewQueue {
  items: ReportsReviewItem[];
  empty: boolean;
}

function safeInt(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0
    ? Math.floor(n)
    : 0;
}

function parseTs(v: string | null): number | null {
  if (!v) return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

export function buildReportsReviewQueue(
  input: ReportsReviewQueueInput,
): ReportsReviewQueue {
  const {
    growId,
    pendingOutcomeReviewCount,
    firstPendingActionId,
    alertsOpen,
    firstOpenAlertId,
    latestSensorCapturedAt,
    recentSensorReadingCount,
    lowSampleLearningGroups,
  } = input;
  const nowMs =
    typeof input.now === "number" && Number.isFinite(input.now)
      ? input.now
      : Date.now();

  const items: ReportsReviewItem[] = [];

  // 1. Completed actions missing outcomes — highest priority.
  const pending = safeInt(pendingOutcomeReviewCount);
  if (pending > 0) {
    const href =
      typeof firstPendingActionId === "string" && firstPendingActionId
        ? actionDetailPath(firstPendingActionId)
        : growDetailPath(growId);
    items.push({
      id: "missing_outcome",
      title: "Record outcomes",
      description:
        pending === 1
          ? "1 completed action is waiting for an outcome note."
          : `${pending} completed actions are waiting for outcome notes.`,
      href,
      hrefLabel: "Open action",
    });
  }

  // 2. Active environment alerts.
  const open = safeInt(alertsOpen);
  if (open > 0) {
    const href =
      open === 1 && typeof firstOpenAlertId === "string" && firstOpenAlertId
        ? alertDetailPath(firstOpenAlertId)
        : alertsPath(growId);
    items.push({
      id: "open_alerts",
      title: "Review open alerts",
      description:
        open === 1
          ? "1 open environment alert needs a look."
          : `${open} open environment alerts need a look.`,
      href,
      hrefLabel: open === 1 ? "Open alert" : "Review alerts",
    });
  }

  // 3. Stale or missing sensor context.
  const latestMs = parseTs(latestSensorCapturedAt);
  const recent = safeInt(recentSensorReadingCount);
  const sensorStale =
    latestMs === null
      ? recent === 0
      : nowMs - latestMs >= STALE_SENSOR_THRESHOLD_MS;
  if (sensorStale) {
    items.push({
      id: "stale_sensor",
      title: "Check sensor context",
      description:
        latestMs === null
          ? "No recent sensor readings recorded for this grow."
          : "Latest sensor reading is more than 24 hours old.",
      href: growDetailPath(growId),
      hrefLabel: "Open grow detail",
    });
  }

  // 4. Low-sample outcome learning patterns.
  const lowSample = safeInt(lowSampleLearningGroups);
  if (lowSample > 0) {
    items.push({
      id: "low_sample_learning",
      title: "Add more outcome history",
      description:
        lowSample === 1
          ? "1 outcome pattern still has too few samples to read confidently."
          : `${lowSample} outcome patterns still have too few samples to read confidently.`,
      href: growDetailPath(growId),
      hrefLabel: "Open learning report",
    });
  }

  const limited = items.slice(0, MAX_REVIEW_ITEMS);
  return { items: limited, empty: limited.length === 0 };
}

export const REPORTS_REVIEW_QUEUE_TITLE = "What to review next";
export const REPORTS_REVIEW_QUEUE_SUBTITLE =
  "Priority follow-ups based on your recorded grow data.";
