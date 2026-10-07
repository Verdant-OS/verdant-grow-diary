/**
 * Dashboard open-alerts view model.
 *
 * A pending or failed alerts read is not "zero alerts". Only a successful
 * read may report a count, and a confirmed zero is a neutral fact, never a
 * success/healthy signal.
 *
 * Pure. No I/O. No React.
 */
import type { AlertsListStatus } from "@/hooks/useAlertsList";

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
      kpiValue: number;
      accent: DashboardOpenAlertsAccent;
    }
  | {
      kind: "pending" | "unavailable";
      kpiValue: string;
      accent: "primary";
      detail: string;
    };

export function buildDashboardOpenAlertsView(input: {
  status: AlertsListStatus;
  openCount: number;
  /**
   * False while the alerts read still belongs to a previous grow scope. The
   * hook starts each new read in a passive effect, so on a scope change its
   * previous 'ok' would otherwise confirm another grow's alerts. Defaults to
   * true.
   */
  readScopeCurrent?: boolean;
}): DashboardOpenAlertsView {
  const stale = input.readScopeCurrent === false;
  const validCount = Number.isFinite(input.openCount) && input.openCount >= 0;
  if (!stale && (input.status === "unavailable" || (input.status === "ok" && !validCount))) {
    return {
      kind: "unavailable",
      kpiValue: DASHBOARD_OPEN_ALERTS_COPY.unavailable,
      accent: "primary",
      detail: DASHBOARD_OPEN_ALERTS_COPY.unavailableDetail,
    };
  }
  if (stale || input.status !== "ok") {
    return {
      kind: "pending",
      kpiValue: DASHBOARD_OPEN_ALERTS_COPY.checking,
      accent: "primary",
      detail: DASHBOARD_OPEN_ALERTS_COPY.checkingDetail,
    };
  }
  return {
    kind: "known",
    kpiValue: input.openCount,
    accent: input.openCount > 0 ? "destructive" : "primary",
  };
}
