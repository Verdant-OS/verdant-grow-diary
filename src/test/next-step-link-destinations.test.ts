/**
 * Next-step destinations for Reports, Alerts, and Action Queue (#2007).
 * Learning report opens the learning page. The Action Queue card does not
 * link back to the queue index. The Alerts card stays hidden when nothing
 * is open to act on.
 */
import { describe, expect, it } from "vitest";
import { buildReportsHubSummary, type ReportsHubInput } from "@/lib/reportsHubViewModel";
import { EMPTY_GROW_OUTCOME_SUMMARY } from "@/lib/growOutcomeRollupRules";
import { EMPTY_LEARNING_REPORT } from "@/lib/actionOutcomeLearningRules";
import {
  resolveOneTentLoopNextStep,
  showAlertsOneTentLoopNextStep,
} from "@/lib/oneTentLoopNavigationRules";
import { growLearningPath } from "@/lib/routes";

const input: ReportsHubInput = {
  growId: "grow-1",
  growName: "QA Test",
  outcomeSummary: EMPTY_GROW_OUTCOME_SUMMARY,
  outcomeLearning: EMPTY_LEARNING_REPORT,
  alertsOpen: 0,
  alertsCritical: 0,
  alertsWarning: 0,
  latestSensorCapturedAt: null,
  recentSensorReadingCount: 0,
  diaryEntriesLast7d: 0,
  diaryEntriesTotal: 0,
};

describe("next-step link destinations (#2007)", () => {
  it("opens the learning report from the learning card", () => {
    const { cards } = buildReportsHubSummary(input);
    const learning = cards.find((card) => card.id === "action_outcome_learning");
    expect(learning?.hrefLabel).toBe("Open learning report");
    expect(learning?.href).toBe(growLearningPath("grow-1"));
  });

  it("does not send the Action Queue step back to the queue index", () => {
    const index = resolveOneTentLoopNextStep("action-queue", { growId: "grow-1" });
    expect(index.disabled).toBe(true);
    expect(index.href).toBeNull();
    expect(index.href ?? "").not.toMatch(/^\/actions/);

    const detail = resolveOneTentLoopNextStep("action-queue", { actionId: "act-1" });
    expect(detail.disabled).toBe(false);
    expect(detail.href).toBe("/actions/act-1");
  });

  it("hides the Alerts loop card when no alert is open", () => {
    expect(showAlertsOneTentLoopNextStep(0)).toBe(false);
    expect(showAlertsOneTentLoopNextStep(Number.NaN)).toBe(false);
    expect(showAlertsOneTentLoopNextStep(2)).toBe(true);
  });
});
