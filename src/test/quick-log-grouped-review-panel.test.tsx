/**
 * Grouped Timeline In-Place Review Panel — render + interaction tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";

type Row = {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  occurred_at: string;
  event_type: string;
  source: string;
  note: string | null;
  watering_events?: { volume_ml: number | null } | null;
  environment_events?: {
    temperature_c: number | null;
    humidity_pct: number | null;
    vpd_kpa: number | null;
  } | null;
};

let nextRows: Row[] = [];

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery() {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.in = () => q;
    q.or = () => q;
    q.order = () => q;
    q.limit = () => Promise.resolve({ data: nextRows, error: null });
    return q;
  }
  return { supabase: { from: () => makeQuery() } };
});

// Capture navigation attempts: any pushState would be a routing mistake.
const originalPushState = window.history.pushState;
let pushStateCalls = 0;

beforeEach(() => {
  nextRows = [];
  pushStateCalls = 0;
  window.history.pushState = function (...args) {
    pushStateCalls += 1;
    return originalPushState.apply(this, args as Parameters<typeof originalPushState>);
  };
});

function renderSection(
  props: Parameters<typeof QuickLogGroupedTimelineSection>[0],
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <QuickLogGroupedTimelineSection {...props} />
    </QueryClientProvider>,
  );
}

const PLANT = "plant-1";
const TENT = "tent-1";

function water(id: string, occurredAt: string, opts: Partial<Row> = {}): Row {
  return {
    id,
    plant_id: PLANT,
    tent_id: TENT,
    occurred_at: occurredAt,
    event_type: "watering",
    source: "manual",
    note: null,
    watering_events: { volume_ml: 500 },
    ...opts,
  };
}
function note(id: string, occurredAt: string, opts: Partial<Row> = {}): Row {
  return {
    id,
    plant_id: PLANT,
    tent_id: TENT,
    occurred_at: occurredAt,
    event_type: "observation",
    source: "manual",
    note: "Top dressed.",
    ...opts,
  };
}
function env(
  id: string,
  occurredAt: string,
  envData: {
    temperature_c?: number | null;
    humidity_pct?: number | null;
    vpd_kpa?: number | null;
  },
  opts: Partial<Row> = {},
): Row {
  return {
    id,
    plant_id: PLANT,
    tent_id: TENT,
    occurred_at: occurredAt,
    event_type: "environment",
    source: "manual",
    note: null,
    environment_events: {
      temperature_c: envData.temperature_c ?? null,
      humidity_pct: envData.humidity_pct ?? null,
      vpd_kpa: envData.vpd_kpa ?? null,
    },
    ...opts,
  };
}

const OPEN = "Review details";
const CLOSE = "Close details";

describe("Grouped Timeline Review Panel — trigger visibility", () => {
  it("grouped Water card renders 'Review details'", async () => {
    nextRows = [
      water("w1", "2026-05-01T10:00:00.000Z"),
      env("e1", "2026-05-01T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const card = screen.getByTestId("quick-log-grouped-card");
    expect(
      within(card).getByTestId("quick-log-grouped-review-trigger").textContent,
    ).toBe(OPEN);
  });

  it("grouped Note card renders 'Review details'", async () => {
    nextRows = [
      note("n1", "2026-05-02T10:00:00.000Z"),
      env("e2", "2026-05-02T10:00:00.500Z", { humidity_pct: 60 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const card = screen.getByTestId("quick-log-grouped-card");
    expect(
      within(card).getByTestId("quick-log-grouped-review-trigger").textContent,
    ).toBe(OPEN);
  });

  it("standalone environment cards have no review trigger", async () => {
    nextRows = [env("eS", "2026-05-03T10:00:00.000Z", { humidity_pct: 55 })];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    expect(
      screen.queryByTestId("quick-log-grouped-review-trigger"),
    ).toBeNull();
  });

  it("ambiguous/unpaired actions have no review trigger", async () => {
    nextRows = [
      water("w1", "2026-05-04T10:00:00.000Z"),
      water("w2", "2026-05-04T10:00:02.000Z"),
      env("e1", "2026-05-04T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    expect(
      screen.queryAllByTestId("quick-log-grouped-review-trigger"),
    ).toHaveLength(0);
  });
});

describe("Grouped Timeline Review Panel — open / close", () => {
  it("clicking the trigger opens the inline panel with both sections", async () => {
    nextRows = [
      water("w1", "2026-05-05T10:00:00.000Z"),
      env("e1", "2026-05-05T10:00:01.000Z", { temperature_c: 24, humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const card = screen.getByTestId("quick-log-grouped-card");
    fireEvent.click(
      within(card).getByTestId("quick-log-grouped-review-trigger"),
    );
    const panel = within(card).getByTestId("quick-log-grouped-review-panel");
    expect(panel).toBeInTheDocument();
    expect(card.getAttribute("data-review-open")).toBe("true");
    expect(
      within(panel).getByTestId("quick-log-grouped-review-panel-title")
        .textContent,
    ).toBe("Grouped timeline details");
    expect(
      within(panel).getByTestId("quick-log-grouped-review-action-section"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByTestId(
        "quick-log-grouped-review-environment-section",
      ),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId("quick-log-grouped-review-trigger").textContent,
    ).toBe(CLOSE);
  });

  it("Water panel shows action kind, occurred_at, Manual source, volume", async () => {
    nextRows = [
      water("w1", "2026-05-06T10:00:00.000Z"),
      env("e1", "2026-05-06T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    fireEvent.click(screen.getByTestId("quick-log-grouped-review-trigger"));
    const panel = screen.getByTestId("quick-log-grouped-review-panel");
    expect(
      within(panel).getByTestId("quick-log-grouped-review-action-kind")
        .textContent,
    ).toBe("Water");
    expect(
      within(panel).getByTestId("quick-log-grouped-review-action-source")
        .textContent,
    ).toBe("Manual");
    expect(
      within(panel).getByTestId(
        "quick-log-grouped-review-action-occurred-at",
      ).textContent,
    ).toBe("2026-05-06T10:00:00.000Z");
    expect(
      within(panel).getByTestId("quick-log-grouped-review-action-volume")
        .textContent,
    ).toContain("500");
  });

  it("Note panel shows action kind, occurred_at, Manual source, note text", async () => {
    nextRows = [
      note("n1", "2026-05-07T10:00:00.000Z"),
      env("e1", "2026-05-07T10:00:00.500Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    fireEvent.click(screen.getByTestId("quick-log-grouped-review-trigger"));
    const panel = screen.getByTestId("quick-log-grouped-review-panel");
    expect(
      within(panel).getByTestId("quick-log-grouped-review-action-kind")
        .textContent,
    ).toBe("Note");
    expect(
      within(panel).getByTestId("quick-log-grouped-review-action-note")
        .textContent,
    ).toBe("Top dressed.");
    expect(
      within(panel).queryByTestId("quick-log-grouped-review-action-volume"),
    ).toBeNull();
  });

  it("env section renders snapshot card with Manual source label", async () => {
    nextRows = [
      water("w1", "2026-05-08T10:00:00.000Z"),
      env("e1", "2026-05-08T10:00:01.000Z", { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.2 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    fireEvent.click(screen.getByTestId("quick-log-grouped-review-trigger"));
    const panel = screen.getByTestId("quick-log-grouped-review-panel");
    const envSection = within(panel).getByTestId(
      "quick-log-grouped-review-environment-section",
    );
    const snapshot = within(envSection).getByTestId(
      "manual-snapshot-timeline-card",
    );
    expect(
      within(snapshot).getByTestId("manual-snapshot-timeline-card-source")
        .textContent,
    ).toBe("Manual");
  });

  it("invalid/warning telemetry status remains visible inside the panel", async () => {
    nextRows = [
      water("w1", "2026-05-09T10:00:00.000Z"),
      env("e1", "2026-05-09T10:00:01.000Z", { humidity_pct: 150 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    fireEvent.click(screen.getByTestId("quick-log-grouped-review-trigger"));
    const panel = screen.getByTestId("quick-log-grouped-review-panel");
    const inner = within(panel).getByTestId("manual-snapshot-timeline-card");
    expect(["warning", "invalid"]).toContain(inner.getAttribute("data-severity"));
  });

  it("Close details hides the panel", async () => {
    nextRows = [
      water("w1", "2026-05-10T10:00:00.000Z"),
      env("e1", "2026-05-10T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const trigger = screen.getByTestId("quick-log-grouped-review-trigger");
    fireEvent.click(trigger);
    expect(
      screen.getByTestId("quick-log-grouped-review-panel"),
    ).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(
      screen.queryByTestId("quick-log-grouped-review-panel"),
    ).toBeNull();
    expect(trigger.textContent).toBe(OPEN);
  });
});

describe("Grouped Timeline Review Panel — invariants", () => {
  it("opening the panel does not navigate (no pushState)", async () => {
    nextRows = [
      water("w1", "2026-05-11T10:00:00.000Z"),
      env("e1", "2026-05-11T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    fireEvent.click(screen.getByTestId("quick-log-grouped-review-trigger"));
    expect(pushStateCalls).toBe(0);
  });

  it("no edit/delete/approve/reject controls render inside the panel", async () => {
    nextRows = [
      water("w1", "2026-05-12T10:00:00.000Z"),
      env("e1", "2026-05-12T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    fireEvent.click(screen.getByTestId("quick-log-grouped-review-trigger"));
    const panel = screen.getByTestId("quick-log-grouped-review-panel");
    const text = panel.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/\bedit\b/);
    expect(text).not.toMatch(/\bdelete\b/);
    expect(text).not.toMatch(/\bapprove\b/);
    expect(text).not.toMatch(/\breject\b/);
    expect(text).not.toMatch(/action queue/);
  });

  it("grouped env event does not also render standalone when panel is open", async () => {
    nextRows = [
      water("w1", "2026-05-13T10:00:00.000Z"),
      env("e1", "2026-05-13T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    fireEvent.click(screen.getByTestId("quick-log-grouped-review-trigger"));
    const kinds = screen
      .getAllByTestId("quick-log-grouped-card")
      .map((c) => c.getAttribute("data-entry-kind"));
    expect(kinds).toEqual(["grouped"]);
  });

  it("ordering remains deterministic after opening/closing the panel", async () => {
    nextRows = [
      water("w-old", "2026-05-14T08:00:00.000Z"),
      env("e-mid", "2026-05-14T09:00:00.000Z", { humidity_pct: 60 }),
      water("w-new", "2026-05-14T10:00:00.000Z"),
      env("e-new", "2026-05-14T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const orderBefore = screen
      .getAllByTestId("quick-log-grouped-card")
      .map((c) => c.getAttribute("data-occurred-at"));
    const trigger = screen.getByTestId("quick-log-grouped-review-trigger");
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    const orderAfter = screen
      .getAllByTestId("quick-log-grouped-card")
      .map((c) => c.getAttribute("data-occurred-at"));
    expect(orderAfter).toEqual(orderBefore);
  });

  it("no live/synced/connected/imported wording appears in the panel", async () => {
    nextRows = [
      water("w1", "2026-05-15T10:00:00.000Z"),
      env("e1", "2026-05-15T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    fireEvent.click(screen.getByTestId("quick-log-grouped-review-trigger"));
    const panel = screen.getByTestId("quick-log-grouped-review-panel");
    const text = panel.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/\blive\b/);
    expect(text).not.toMatch(/\bsynced\b/);
    expect(text).not.toMatch(/\bconnected\b/);
    expect(text).not.toMatch(/\blinked\b/);
    expect(text).not.toMatch(/\bimported\b/);
  });
});
