/**
 * Alerts page — AlertCard sensor provenance badge wiring.
 *
 * Verifies that alert list rows render the unified
 * `SensorSourceProvenanceBadge` whenever a sensor source is derivable
 * (via `alert.source` or `[source:<x>]` lineage tag), and never leak
 * the alert id, grow id, or raw `[alert:<id>]` / `[source:<x>]` tokens
 * in visible text, aria labels, title text, or test-visible attributes.
 *
 * Also confirms manual never renders as Live, and unknown/missing
 * source values never silently surface a misleading badge.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Alerts from "@/pages/Alerts";

const baseAlert = {
  id: "alert-uuid-list-1",
  grow_id: "grow-uuid-list-1",
  tent_id: "tent-uuid-list-1",
  plant_id: null as string | null,
  source: "environment_alerts",
  severity: "warning" as const,
  status: "open" as const,
  metric: "humidity_pct",
  title: "Humidity is high",
  reason: "Humidity is high (78% > 65%)",
  first_seen_at: "2026-05-30T10:00:00Z",
  last_seen_at: "2026-05-30T10:30:00Z",
  acknowledged_at: null,
  resolved_at: null,
  created_at: "2026-05-30T10:00:00Z",
  updated_at: "2026-05-30T10:30:00Z",
};

let currentAlerts: Array<typeof baseAlert> = [baseAlert];

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: "/",
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [], activeGrowId: null }),
}));
vi.mock("@/components/AlertsAutoPersistForGrow", () => ({
  default: () => null,
}));
vi.mock("@/components/AlertWhyContext", () => ({
  AlertWhyContext: () => null,
}));
vi.mock("@/components/LinkedActionCountBadge", () => ({
  LinkedActionCountBadge: () => null,
}));
vi.mock("@/hooks/useAlertsLinkedActionCounts", () => ({
  useAlertsLinkedActionCounts: () => new Map(),
}));
vi.mock("@/hooks/useAlertEvents", () => ({
  useAlertEvents: () => ({ status: "ok", events: [] }),
}));
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({
    status: "ok",
    alerts: currentAlerts,
    error: null,
    reload: () => {},
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function renderAlerts() {
  return render(
    <MemoryRouter>
      <Alerts />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  currentAlerts = [baseAlert];
});

const BADGE_ID = "alert-row-sensor-source-badge";

describe("Alerts list — sensor provenance badge", () => {
  it("renders Manual badge when reason carries [source:manual]", () => {
    currentAlerts = [
      {
        ...baseAlert,
        reason: "Humidity high (manual reading 78%). [source:manual]",
      },
    ];
    renderAlerts();
    const el = screen.getByTestId(BADGE_ID);
    expect(el.getAttribute("data-tone")).toBe("manual");
    expect(el.textContent).toContain("Manual");
    expect(el.textContent?.toLowerCase()).not.toContain("live");
  });

  it("renders Live badge only when source is genuinely live", () => {
    currentAlerts = [{ ...baseAlert, source: "live" }];
    renderAlerts();
    const el = screen.getByTestId(BADGE_ID);
    expect(el.getAttribute("data-tone")).toBe("live");
    expect(el.textContent).toBe("Live sensor");
  });

  it.each(["demo", "stale", "invalid"] as const)(
    "renders %s as degraded, never as Live",
    (src) => {
      currentAlerts = [{ ...baseAlert, source: src }];
      renderAlerts();
      const el = screen.getByTestId(BADGE_ID);
      expect(el.getAttribute("data-tone")).toBe(src);
      expect(el.getAttribute("data-degraded")).toBe("true");
      expect(el.textContent?.toLowerCase()).not.toContain("live");
    },
  );

  it("omits the badge when source is unknown/unrecognized (avoids fake Unknown chip)", () => {
    currentAlerts = [{ ...baseAlert, source: "environment_alerts" }];
    renderAlerts();
    expect(screen.queryByTestId(BADGE_ID)).toBeNull();
  });

  it("manual + vendor hint never promotes to Live or vendor wording", () => {
    currentAlerts = [
      {
        ...baseAlert,
        reason: "Humidity high. [source:manual] (EcoWitt WH45)",
      },
    ];
    renderAlerts();
    const el = screen.getByTestId(BADGE_ID);
    expect(el.getAttribute("data-tone")).toBe("manual");
    const txt = el.textContent ?? "";
    expect(txt.toLowerCase()).not.toContain("live");
    expect(txt.toLowerCase()).not.toContain("ecowitt");
  });

  it("badge visible text / aria / title do not leak ids or back-pointer tokens", () => {
    currentAlerts = [
      {
        ...baseAlert,
        reason: "Lower humidity. [source:stale] [alert:alert-uuid-list-1]",
        source: "stale",
      },
    ];
    renderAlerts();
    const el = screen.getByTestId(BADGE_ID);
    const aria = el.getAttribute("aria-label") ?? "";
    const title = el.getAttribute("title") ?? "";
    const txt = el.textContent ?? "";
    for (const probe of ["alert-uuid-list-1", "grow-uuid-list-1", "[alert:", "[source:"]) {
      expect(aria).not.toContain(probe);
      expect(title).not.toContain(probe);
      expect(txt).not.toContain(probe);
    }
    expect(aria).toBe("Sensor source: Stale reading");
  });

  it("renders inside the AlertCard article alongside the existing source label", () => {
    currentAlerts = [{ ...baseAlert, source: "manual" }];
    renderAlerts();
    const article = screen.getByRole("article");
    expect(within(article).getByTestId("alert-row-source")).toBeInTheDocument();
    expect(within(article).getByTestId(BADGE_ID)).toBeInTheDocument();
  });
});
