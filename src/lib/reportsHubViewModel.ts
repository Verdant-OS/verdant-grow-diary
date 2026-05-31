/**
 * reportsHubViewModel — pure helpers that translate raw report inputs into
 * card descriptors rendered by the Reports / Grow Learning Hub page.
 *
 * SAFETY / SCOPE:
 *  - Pure, deterministic. No I/O, React, DB, network, or device control.
 *  - Display/labeling only. Never mutates any record.
 *  - Copy stays observational. Never claims an action "fixed", "caused",
 *    "guaranteed", or restored a plant to "healthy" status. Never ranks
 *    groups as "best" / "worst".
 *  - Aggregation lives here, not inside JSX.
 */
import type { GrowOutcomeSummary } from "@/lib/growOutcomeRollupRules";
import type { ActionOutcomeLearningReport } from "@/lib/actionOutcomeLearningRules";
import {
  actionsPath,
  alertsPath,
  growDetailPath,
  logsPath,
} from "@/lib/routes";

export type ReportsHubCardId =
  | "action_outcome_learning"
  | "recent_outcomes"
  | "environment_alerts"
  | "sensor_context"
  | "timeline_activity";

export interface ReportsHubCard {
  id: ReportsHubCardId;
  title: string;
  description: string;
  /** Primary stat line, e.g. "12 recorded outcomes" or "No data yet". */
  primaryStat: string;
  /** Secondary detail chips, e.g. "Improved 4 · Unchanged 5 · Worsened 3". */
  secondaryStats: string[];
  /** Optional caveat line, e.g. "Early patterns only — more grow history improves confidence." */
  caveat: string | null;
  /** Destination link to an existing detail surface (GrowDetail / Alerts / Actions / Timeline). */
  href: string;
  /** Link CTA copy. */
  hrefLabel: string;
  /** True when this card has no data to show. */
  empty: boolean;
}

export interface ReportsHubInput {
  growId: string;
  growName: string;
  outcomeSummary: GrowOutcomeSummary;
  outcomeLearning: ActionOutcomeLearningReport;
  alertsOpen: number;
  alertsCritical: number;
  alertsWarning: number;
  latestSensorCapturedAt: string | null;
  recentSensorReadingCount: number;
  diaryEntriesLast7d: number;
  diaryEntriesTotal: number;
}

export interface ReportsHubSummary {
  /** All five cards in display order. */
  cards: ReportsHubCard[];
  /** True when every card is empty (drives the page-level empty state). */
  allEmpty: boolean;
}

const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleString();
};

const safeInt = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;

export function buildReportsHubSummary(input: ReportsHubInput): ReportsHubSummary {
  const {
    growId,
    growName,
    outcomeSummary,
    outcomeLearning,
    alertsOpen,
    alertsCritical,
    alertsWarning,
    latestSensorCapturedAt,
    recentSensorReadingCount,
    diaryEntriesLast7d,
    diaryEntriesTotal,
  } = input;

  const totalOutcomes = safeInt(outcomeSummary.total);
  const improved = safeInt(outcomeSummary.improved);
  const unchanged = safeInt(outcomeSummary.unchanged);
  const worsened = safeInt(outcomeSummary.worsened);
  const moreData = safeInt(outcomeSummary.more_data_needed);

  const learningGroups = Array.isArray(outcomeLearning?.groups)
    ? outcomeLearning.groups.length
    : 0;

  const cards: ReportsHubCard[] = [
    {
      id: "action_outcome_learning",
      title: "Action Outcome Learning",
      description: "Patterns from outcomes recorded after completed actions.",
      primaryStat:
        learningGroups > 0
          ? `${learningGroups} grouped pattern${learningGroups === 1 ? "" : "s"}`
          : "No grouped patterns yet",
      secondaryStats:
        totalOutcomes > 0
          ? [`${totalOutcomes} recorded outcome${totalOutcomes === 1 ? "" : "s"}`]
          : [],
      caveat: "Early patterns only — more grow history improves confidence.",
      href: growDetailPath(growId),
      hrefLabel: "Open learning report",
      empty: learningGroups === 0 && totalOutcomes === 0,
    },
    {
      id: "recent_outcomes",
      title: "Recent Outcomes",
      description: "Recorded outcomes after completed actions.",
      primaryStat:
        totalOutcomes > 0
          ? `${totalOutcomes} recorded outcome${totalOutcomes === 1 ? "" : "s"}`
          : "No recorded outcomes yet",
      secondaryStats:
        totalOutcomes > 0
          ? [
              `Improved ${improved}`,
              `Unchanged ${unchanged}`,
              `Worsened ${worsened}`,
              `More data needed ${moreData}`,
            ]
          : [],
      caveat: null,
      href: growDetailPath(growId),
      hrefLabel: "Open grow detail",
      empty: totalOutcomes === 0,
    },
    {
      id: "environment_alerts",
      title: "Environment Alerts",
      description: "Open environment alerts scoped to this grow.",
      primaryStat:
        alertsOpen > 0
          ? `${alertsOpen} open alert${alertsOpen === 1 ? "" : "s"}`
          : "No open alerts",
      secondaryStats:
        alertsOpen > 0
          ? [`Critical ${alertsCritical}`, `Warning ${alertsWarning}`]
          : [],
      caveat: null,
      href: alertsPath(growId),
      hrefLabel: "Review alerts",
      empty: alertsOpen === 0,
    },
    {
      id: "sensor_context",
      title: "Sensor Context",
      description: "Recent sensor readings for tents in this grow.",
      primaryStat:
        recentSensorReadingCount > 0
          ? `${recentSensorReadingCount} recent reading${recentSensorReadingCount === 1 ? "" : "s"}`
          : "No recent sensor readings",
      secondaryStats: latestSensorCapturedAt
        ? [`Last reading ${fmtDate(latestSensorCapturedAt)}`]
        : [],
      caveat: null,
      href: growDetailPath(growId),
      hrefLabel: "Open grow detail",
      empty: recentSensorReadingCount === 0 && !latestSensorCapturedAt,
    },
    {
      id: "timeline_activity",
      title: "Timeline Activity",
      description: `Diary activity logged for ${growName}.`,
      primaryStat:
        diaryEntriesTotal > 0
          ? `${diaryEntriesTotal} diary entr${diaryEntriesTotal === 1 ? "y" : "ies"}`
          : "No diary entries yet",
      secondaryStats:
        diaryEntriesTotal > 0
          ? [`Last 7 days: ${diaryEntriesLast7d}`]
          : [],
      caveat: null,
      href: logsPath(growId),
      hrefLabel: "Open timeline",
      empty: diaryEntriesTotal === 0,
    },
  ];

  // actionsPath referenced to keep import valid for callers wiring CTAs.
  void actionsPath;

  return {
    cards,
    allEmpty: cards.every((c) => c.empty),
  };
}

export const REPORTS_HUB_EMPTY_COPY =
  "No grow learning data yet. Start by logging plant activity, sensor readings, and action outcomes.";

export const REPORTS_HUB_SUBTITLE_COPY =
  "Review recorded grow outcomes, alerts, sensor readings, and timeline activity.";
