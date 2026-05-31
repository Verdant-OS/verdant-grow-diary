/**
 * reportsHubOnboarding — pure helper that decides whether to surface the
 * "Start building your grow memory" onboarding section on the Grow Learning
 * Hub, and builds the 3 setup cards shown when it is visible.
 *
 * SAFETY / SCOPE:
 *  - Pure, deterministic. No I/O, React, DB, network, or device control.
 *  - Display-only. Never mutates any record.
 *  - Copy is observational and onboarding-focused. Never claims reports are
 *    "fixed", "guaranteed", "healthy", or "complete".
 */
import {
  actionsPath,
  plantsPath,
} from "@/lib/routes";

export const REPORTS_HUB_ONBOARDING_TITLE = "Start building your grow memory";
export const REPORTS_HUB_ONBOARDING_SUBTITLE =
  "Add a few details so this hub has something to learn from.";

export type ReportsHubOnboardingCardId =
  | "add_plant"
  | "add_sensor_snapshot"
  | "review_action_outcome";

export interface ReportsHubOnboardingCard {
  id: ReportsHubOnboardingCardId;
  title: string;
  description: string;
  href: string;
  hrefLabel: string;
}

export interface ReportsHubOnboardingInput {
  growId: string | null | undefined;
  diaryEntriesTotal: number;
  recentSensorReadingCount: number;
  latestSensorCapturedAt: string | null;
  outcomeTotal: number;
  alertsOpen: number;
}

export interface ReportsHubOnboarding {
  visible: boolean;
  cards: ReportsHubOnboardingCard[];
}

function safeInt(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0
    ? Math.floor(n)
    : 0;
}

/**
 * "Meaningful data" = any of: at least one diary entry, any recorded
 * outcomes, any recent sensor reading, or any open alert. When none of
 * these are true, the onboarding section is shown.
 */
export function hasMeaningfulReportsData(
  input: Pick<
    ReportsHubOnboardingInput,
    | "diaryEntriesTotal"
    | "recentSensorReadingCount"
    | "latestSensorCapturedAt"
    | "outcomeTotal"
    | "alertsOpen"
  >,
): boolean {
  return (
    safeInt(input.diaryEntriesTotal) > 0 ||
    safeInt(input.recentSensorReadingCount) > 0 ||
    safeInt(input.outcomeTotal) > 0 ||
    safeInt(input.alertsOpen) > 0 ||
    typeof input.latestSensorCapturedAt === "string"
  );
}

export function buildReportsHubOnboarding(
  input: ReportsHubOnboardingInput,
): ReportsHubOnboarding {
  const visible = !hasMeaningfulReportsData(input);
  if (!visible) return { visible: false, cards: [] };

  const growId = input.growId ?? null;
  const cards: ReportsHubOnboardingCard[] = [
    {
      id: "add_plant",
      title: "Add a plant",
      description:
        "Plant profiles anchor the diary, photos, and sensor history this hub reads from.",
      href: plantsPath(growId),
      hrefLabel: "Open plants",
    },
    {
      id: "add_sensor_snapshot",
      title: "Add a manual sensor snapshot",
      description:
        "A quick temperature, humidity, or VPD entry gives this hub recent sensor context.",
      href: "/sensors",
      hrefLabel: "Open sensors",
    },
    {
      id: "review_action_outcome",
      title: "Review an action outcome",
      description:
        "Mark a completed action with what you observed afterward so patterns can start forming.",
      href: actionsPath(growId),
      hrefLabel: "Open actions",
    },
  ];
  return { visible: true, cards };
}
