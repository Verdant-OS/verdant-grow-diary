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
 *  - Priority/ranking, tooltip help, and "Why this is here" formatting all
 *    live here, not in JSX.
 *  - Never embeds raw payloads, secrets, or user IDs in user-visible copy.
 */
import {
  actionDetailOutcomePath,
  alertDetailPath,
  alertsPath,
  growDetailOutcomesPath,
  growDetailPath,
  sensorsPath,
} from "@/lib/routes";

export const STALE_SENSOR_THRESHOLD_MS = 24 * 60 * 60 * 1000;
export const MAX_REVIEW_ITEMS = 4;

export type ReportsReviewItemId =
  | "missing_outcome"
  | "open_alerts"
  | "stale_sensor"
  | "low_sample_learning";

/** Short tooltip/help copy for each card type — explains the observable
 *  signal that put the card on the list, without making causal claims. */
export const REVIEW_ITEM_HELP_TEXT: Record<ReportsReviewItemId, string> = {
  missing_outcome:
    "Completed action older than 24 hours with no recorded outcome.",
  open_alerts: "Unresolved environment alert for this grow.",
  stale_sensor: "Sensor context is stale or unavailable.",
  low_sample_learning:
    "Outcome pattern has too few recorded examples to read confidently.",
};

export interface ReportsReviewItem {
  id: ReportsReviewItemId;
  title: string;
  description: string;
  /** Tooltip/help copy — the observable signal that triggered this card. */
  helpText: string;
  /** Short line summarizing the specific data behind this card, e.g.
   *  "Oldest completed 36h ago" or "Sample 2 of 3 needed". */
  whyThisIsHere: string;
  href: string;
  hrefLabel: string;
}

export interface ReportsReviewQueueInput {
  growId: string;
  pendingOutcomeReviewCount: number;
  firstPendingActionId: string | null;
  oldestPendingCompletedAt: string | null;
  alertsOpen: number;
  firstOpenAlertId: string | null;
  firstOpenAlertSeverity: string | null;
  firstOpenAlertCreatedAt: string | null;
  latestSensorCapturedAt: string | null;
  recentSensorReadingCount: number;
  lowSampleLearningGroups: number;
  lowSampleSmallestCount: number | null;
  lowSampleThreshold: number | null;
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

function parseTs(v: string | null | undefined): number | null {
  if (typeof v !== "string" || !v) return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "moments ago";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const ALLOWED_SEVERITIES = new Set(["critical", "warning", "info"]);
function normalizeSeverity(s: string | null): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim().toLowerCase();
  return ALLOWED_SEVERITIES.has(trimmed) ? trimmed : null;
}

export function buildReportsReviewQueue(
  input: ReportsReviewQueueInput,
): ReportsReviewQueue {
  const {
    growId,
    pendingOutcomeReviewCount,
    firstPendingActionId,
    oldestPendingCompletedAt,
    alertsOpen,
    firstOpenAlertId,
    firstOpenAlertSeverity,
    firstOpenAlertCreatedAt,
    latestSensorCapturedAt,
    recentSensorReadingCount,
    lowSampleLearningGroups,
    lowSampleSmallestCount,
    lowSampleThreshold,
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
    const oldestMs = parseTs(oldestPendingCompletedAt);
    const whyParts: string[] = [
      `${pending} pending review${pending === 1 ? "" : "s"}`,
    ];
    if (oldestMs !== null) {
      whyParts.push(`oldest completed ${formatAge(nowMs - oldestMs)}`);
    }
    items.push({
      id: "missing_outcome",
      title: "Record outcomes",
      description:
        pending === 1
          ? "1 completed action is waiting for an outcome note."
          : `${pending} completed actions are waiting for outcome notes.`,
      helpText: REVIEW_ITEM_HELP_TEXT.missing_outcome,
      whyThisIsHere: whyParts.join(" · "),
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
    const severity = normalizeSeverity(firstOpenAlertSeverity);
    const createdMs = parseTs(firstOpenAlertCreatedAt);
    const whyParts: string[] = [
      `${open} open alert${open === 1 ? "" : "s"}`,
    ];
    if (severity) whyParts.push(`latest severity ${severity}`);
    if (createdMs !== null) whyParts.push(`opened ${formatAge(nowMs - createdMs)}`);
    items.push({
      id: "open_alerts",
      title: "Review open alerts",
      description:
        open === 1
          ? "1 open environment alert needs a look."
          : `${open} open environment alerts need a look.`,
      helpText: REVIEW_ITEM_HELP_TEXT.open_alerts,
      whyThisIsHere: whyParts.join(" · "),
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
    const whyThisIsHere =
      latestMs === null
        ? "No sensor readings recorded yet"
        : `Latest reading ${formatAge(nowMs - latestMs)}`;
    items.push({
      id: "stale_sensor",
      title: "Check sensor context",
      description:
        latestMs === null
          ? "No recent sensor readings recorded for this grow."
          : "Latest sensor reading is more than 24 hours old.",
      helpText: REVIEW_ITEM_HELP_TEXT.stale_sensor,
      whyThisIsHere,
      href: growDetailPath(growId),
      hrefLabel: "Open grow detail",
    });
  }

  // 4. Low-sample outcome learning patterns.
  const lowSample = safeInt(lowSampleLearningGroups);
  if (lowSample > 0) {
    const threshold =
      typeof lowSampleThreshold === "number" && lowSampleThreshold > 0
        ? Math.floor(lowSampleThreshold)
        : null;
    const smallest =
      typeof lowSampleSmallestCount === "number" && lowSampleSmallestCount >= 0
        ? Math.floor(lowSampleSmallestCount)
        : null;
    const whyParts: string[] = [
      `${lowSample} pattern${lowSample === 1 ? "" : "s"} below sample threshold`,
    ];
    if (smallest !== null && threshold !== null) {
      whyParts.push(`smallest has ${smallest} of ${threshold} needed`);
    } else if (threshold !== null) {
      whyParts.push(`threshold ${threshold}`);
    }
    items.push({
      id: "low_sample_learning",
      title: "Add more outcome history",
      description:
        lowSample === 1
          ? "1 outcome pattern still has too few samples to read confidently."
          : `${lowSample} outcome patterns still have too few samples to read confidently.`,
      helpText: REVIEW_ITEM_HELP_TEXT.low_sample_learning,
      whyThisIsHere: whyParts.join(" · "),
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
export const REPORTS_REVIEW_QUEUE_EMPTY_COPY =
  "No priority review items right now. Keep logging activity, sensor readings, and outcomes to build stronger patterns.";
