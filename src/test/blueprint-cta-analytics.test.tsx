/**
 * blueprint_cta_clicked — funnel instrumentation for Blueprint entry intent.
 *
 * The Target Band link is the highest-intent Blueprint entry point (a grower
 * clicking it from a live alert is asking exactly the question Craft answers)
 * and it reported nothing. Notably, mirroring the neighbouring doctor CTA as
 * it originally shipped would NOT have fixed that: its bespoke CustomEvent
 * had no listener anywhere, so it never reached a sink (that dispatch has
 * since been replaced by the alert_doctor_cta_clicked funnel event). This
 * event routes through trackFunnelEvent -> gtag, keeping the same privacy
 * contract (severity bucket + fixed metric token, never an id).
 *
 * The vacuity risk these tests target: trackFunnelEvent SILENTLY strips any
 * param not in FUNNEL_PARAM_KEYS and not in the event's schema. A test that
 * only asserts "the call happened" passes even when metric/severity never
 * reach gtag. So the catalog tests below run the real sanitizer chain on the
 * exact payload the click sends.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const spies = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock("@/lib/funnelAnalytics", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/funnelAnalytics")>();
  return { ...real, trackFunnelEvent: spies.track };
});

import { FUNNEL_EVENTS, sanitizeFunnelParams } from "@/lib/funnelAnalytics";
import { FUNNEL_EVENT_SCHEMA, enforceFunnelEventSchema } from "@/lib/funnelEventSchema";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({ status: "ready", rows: mocks.rows }),
}));

vi.mock("@/components/ui/card", () => {
  const P = ({ children, ...r }: { children?: ReactNode; [k: string]: unknown }) => (
    <div {...r}>{children}</div>
  );
  return { Card: P, CardContent: P, CardHeader: P, CardTitle: P };
});

import PlantAssignedTentAlertsPanel from "@/components/PlantAssignedTentAlertsPanel";

const row = (metric: string | null) => ({
  id: "alert-1",
  title: "Temperature high",
  reason: "28.4C above the flower band",
  severity: "warning" as const,
  severityLabel: "Warning",
  metric,
  status: "open" as const,
  lastSeenAt: null,
});

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={["/plants/plant-1"]}>
      <PlantAssignedTentAlertsPanel
        tentId="tent-1"
        tentName="Flower Tent"
        growId="grow-1"
        plantId="plant-1"
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  spies.track.mockClear();
  mocks.rows = [row("temp")];
});

describe("blueprint_cta_clicked · catalog", () => {
  it("is registered with exactly surface + metric + severity", () => {
    expect(FUNNEL_EVENTS).toContain("blueprint_cta_clicked");
    expect(FUNNEL_EVENT_SCHEMA.blueprint_cta_clicked).toEqual(["surface", "metric", "severity"]);
  });

  it("survives the real sanitizer chain intact — nothing silently stripped", () => {
    // This is the assertion that catches a registered event with
    // unregistered params: the sanitizer drops unknown keys without error.
    const sent = { surface: "tent_alert_row", metric: "temp", severity: "warning" };
    const out = enforceFunnelEventSchema("blueprint_cta_clicked", sanitizeFunnelParams(sent));
    expect(out).toEqual(sent);
  });

  it("stays out of the paywall funnel by name", () => {
    expect("blueprint_cta_clicked").not.toMatch(/paywall/);
    expect(FUNNEL_EVENT_SCHEMA.paywall_cta_clicked).not.toContain("metric");
  });
});

describe("blueprint_cta_clicked · Target Band click", () => {
  it("fires once with the exact id-free payload", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("plant-assigned-tent-alert-target-band"));
    expect(spies.track).toHaveBeenCalledTimes(1);
    expect(spies.track).toHaveBeenCalledWith("blueprint_cta_clicked", {
      surface: "tent_alert_row",
      metric: "temp",
      severity: "warning",
    });
    const serialized = JSON.stringify(spies.track.mock.calls[0]);
    expect(serialized).not.toContain("alert-1");
    expect(serialized).not.toContain("plant-1");
    expect(serialized).not.toContain("tent-1");
    expect(serialized).not.toContain("grow-1");
  });

  it("does not fire from the neighbouring doctor CTA", () => {
    // The doctor CTA reports its own alert_doctor_cta_clicked funnel event;
    // blueprint_cta_clicked belongs to Blueprint entry alone.
    renderPanel();
    fireEvent.click(screen.getByTestId("plant-assigned-tent-alert-ask-doctor"));
    const names = spies.track.mock.calls.map(([name]) => name);
    expect(names).not.toContain("blueprint_cta_clicked");
    expect(names).toEqual(["alert_doctor_cta_clicked"]);
  });
});
