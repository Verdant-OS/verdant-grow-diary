/**
 * Dashboard open-alerts view model.
 *
 * A pending or failed alerts read is not "zero alerts". Only a successful
 * read may report a count, and a confirmed zero is a neutral fact, never a
 * success/healthy signal.
 *
 * Pure. No I/O. No React.
 */

export const DASHBOARD_OPEN_ALERTS_COPY = {
  // Not "Loading…": that exact text is the app shell's global loading screen.
  checking: "Checking…",
  unavailable: "Unavailable",
  checkingDetail: "Checking open alerts…",
  unavailableDetail: "Open alerts could not be loaded. This does not mean there are none.",
} as const;

export type DashboardOpenAlertsAccent = "destructive" | "primary";

export type DashboardOpenAlertsView =
  | {
      kind: "known";
      count: number;
      kpiValue: number;
      accent: DashboardOpenAlertsAccent;
      showEmpty: boolean;
    }
  | {
      kind: "pending" | "unavailable";
      kpiValue: string;
      accent: "primary";
      showEmpty: false;
      detail: string;
    };

export function buildDashboardOpenAlertsView(input: {
  status: string | null | undefined;
  openCount: number;
}): DashboardOpenAlertsView {
  const validCount = Number.isFinite(input.openCount) && input.openCount >= 0;
  if (input.status === "unavailable" || (input.status === "ok" && !validCount)) {
    return {
      kind: "unavailable",
      kpiValue: DASHBOARD_OPEN_ALERTS_COPY.unavailable,
      accent: "primary",
      showEmpty: false,
      detail: DASHBOARD_OPEN_ALERTS_COPY.unavailableDetail,
    };
  }
  if (input.status !== "ok") {
    return {
      kind: "pending",
      kpiValue: DASHBOARD_OPEN_ALERTS_COPY.checking,
      accent: "primary",
      showEmpty: false,
      detail: DASHBOARD_OPEN_ALERTS_COPY.checkingDetail,
    };
  }
  const count = input.openCount;
  return {
    kind: "known",
    count,
    kpiValue: count,
    accent: count > 0 ? "destructive" : "primary",
    showEmpty: count === 0,
  };
}
