import { describe, it, expect } from "vitest";
import {
  buildDashboardOpenAlertsView,
  DASHBOARD_OPEN_ALERTS_COPY,
} from "@/lib/dashboardOpenAlertsViewModel";

describe("buildDashboardOpenAlertsView", () => {
  it("reports a count only after the alerts read succeeds", () => {
    expect(buildDashboardOpenAlertsView({ status: "ok", openCount: 2 })).toEqual({
      kind: "known",
      kpiValue: 2,
      accent: "destructive",
    });
  });

  it("never styles a confirmed zero as success", () => {
    const view = buildDashboardOpenAlertsView({ status: "ok", openCount: 0 });
    expect(view).toEqual({ kind: "known", kpiValue: 0, accent: "primary" });
    expect(view.accent).not.toBe("success");
  });

  it.each(["idle", "loading"] as const)("treats a %s read as pending, not zero", (status) => {
    const view = buildDashboardOpenAlertsView({ status, openCount: 0 });
    expect(view).toEqual({
      kind: "pending",
      kpiValue: DASHBOARD_OPEN_ALERTS_COPY.checking,
      accent: "primary",
      detail: DASHBOARD_OPEN_ALERTS_COPY.checkingDetail,
    });
  });

  it("treats a failed read as unavailable, not zero", () => {
    expect(buildDashboardOpenAlertsView({ status: "unavailable", openCount: 0 })).toEqual({
      kind: "unavailable",
      kpiValue: DASHBOARD_OPEN_ALERTS_COPY.unavailable,
      accent: "primary",
      detail: DASHBOARD_OPEN_ALERTS_COPY.unavailableDetail,
    });
  });

  it("rejects a negative or non-finite count", () => {
    for (const openCount of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildDashboardOpenAlertsView({ status: "ok", openCount }).kind).toBe("unavailable");
    }
  });

  it.each(["ok", "unavailable"] as const)(
    "treats a previous grow scope's %s read as pending, not this grow's result",
    (status) => {
      const view = buildDashboardOpenAlertsView({ status, openCount: 0, readScopeCurrent: false });
      expect(view.kind).toBe("pending");
      expect(view.kpiValue).toBe(DASHBOARD_OPEN_ALERTS_COPY.checking);
    },
  );

  it("accepts the read once its scope is current", () => {
    expect(
      buildDashboardOpenAlertsView({ status: "ok", openCount: 1, readScopeCurrent: true }).kind,
    ).toBe("known");
  });

  it("never uses the app shell's exact Loading… text", () => {
    for (const value of Object.values(DASHBOARD_OPEN_ALERTS_COPY)) {
      expect(value).not.toBe("Loading…");
    }
  });
});
