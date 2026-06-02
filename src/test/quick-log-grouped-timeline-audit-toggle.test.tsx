/**
 * Grouped Timeline Audit Toggle — render + interaction tests.
 *
 * Covers:
 *  - Grouped Water/Note cards collapsed by default.
 *  - Audit toggle expands into Action + Environment subcards.
 *  - Collapse restores grouped view.
 *  - Standalone action/environment entries never render the audit toggle.
 *  - Source label remains "Manual" in both states.
 *  - Invalid/warning telemetry stays visible in collapsed + expanded states.
 *  - Grouped env never also renders as standalone outside expanded view.
 *  - Ordering remains deterministic across toggling.
 *  - No live/synced/connected/imported wording in the section.
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

beforeEach(() => {
  nextRows = [];
});

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

const EXPAND = "Review grouped details";
const COLLAPSE = "Hide grouped details";

describe("Grouped Timeline Audit Toggle — defaults", () => {
  it("grouped Water + env renders collapsed by default", async () => {
    nextRows = [
      water("w1", "2026-04-01T10:00:00.000Z"),
      env("e1", "2026-04-01T10:00:01.000Z", { temperature_c: 24, humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const card = screen.getByTestId("quick-log-grouped-card");
    expect(card.getAttribute("data-audit-expanded")).toBe("false");
    expect(
      within(card).queryByTestId("quick-log-grouped-audit-expanded"),
    ).toBeNull();
    expect(within(card).getByTestId("quick-log-grouped-audit-toggle").textContent).toBe(
      EXPAND,
    );
    expect(within(card).getByTestId("quick-log-grouped-action-source").textContent).toBe(
      "Manual",
    );
  });

  it("grouped Note + env renders collapsed by default", async () => {
    nextRows = [
      note("n1", "2026-04-02T10:00:00.000Z"),
      env("e2", "2026-04-02T10:00:00.500Z", { humidity_pct: 60 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const card = screen.getByTestId("quick-log-grouped-card");
    expect(card.getAttribute("data-audit-expanded")).toBe("false");
    expect(within(card).getByTestId("quick-log-grouped-audit-toggle").textContent).toBe(
      EXPAND,
    );
  });
});

describe("Grouped Timeline Audit Toggle — expand / collapse", () => {
  it("clicking the toggle expands into Action + Environment subcards", async () => {
    nextRows = [
      water("w1", "2026-04-03T10:00:00.000Z"),
      env("e1", "2026-04-03T10:00:01.000Z", { temperature_c: 24, humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const card = screen.getByTestId("quick-log-grouped-card");
    fireEvent.click(within(card).getByTestId("quick-log-grouped-audit-toggle"));
    expect(card.getAttribute("data-audit-expanded")).toBe("true");
    expect(
      within(card).getByTestId("quick-log-grouped-audit-action-subcard"),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId("quick-log-grouped-audit-environment-subcard"),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId(
        "quick-log-grouped-audit-action-subcard-title",
      ).textContent,
    ).toBe("Action event");
    expect(
      within(card).getByTestId(
        "quick-log-grouped-audit-environment-subcard-title",
      ).textContent,
    ).toBe("Manual environment snapshot");
    expect(
      within(card).getByTestId("quick-log-grouped-action-source").textContent,
    ).toBe("Manual");
    expect(
      within(card).getByTestId("manual-snapshot-timeline-card-source").textContent,
    ).toBe("Manual");
    expect(within(card).getByTestId("quick-log-grouped-audit-toggle").textContent).toBe(
      COLLAPSE,
    );
  });

  it("collapse button restores collapsed grouped view", async () => {
    nextRows = [
      water("w1", "2026-04-04T10:00:00.000Z"),
      env("e1", "2026-04-04T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const card = screen.getByTestId("quick-log-grouped-card");
    const toggle = within(card).getByTestId("quick-log-grouped-audit-toggle");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(card.getAttribute("data-audit-expanded")).toBe("false");
    expect(
      within(card).queryByTestId("quick-log-grouped-audit-expanded"),
    ).toBeNull();
    expect(toggle.textContent).toBe(EXPAND);
  });
});

describe("Grouped Timeline Audit Toggle — non-grouped entries", () => {
  it("standalone environment card never renders the audit toggle", async () => {
    nextRows = [env("eS", "2026-04-05T10:00:00.000Z", { humidity_pct: 55 })];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const card = screen.getByTestId("quick-log-grouped-card");
    expect(card.getAttribute("data-entry-kind")).toBe("environment");
    expect(
      within(card).queryByTestId("quick-log-grouped-audit-toggle"),
    ).toBeNull();
  });

  it("ambiguous/unpaired action entries do not render the audit toggle", async () => {
    nextRows = [
      water("w1", "2026-04-06T10:00:00.000Z"),
      water("w2", "2026-04-06T10:00:02.000Z"),
      env("e1", "2026-04-06T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const toggles = screen.queryAllByTestId("quick-log-grouped-audit-toggle");
    expect(toggles).toHaveLength(0);
  });
});

describe("Grouped Timeline Audit Toggle — telemetry severity", () => {
  it("invalid telemetry is visible in collapsed state", async () => {
    nextRows = [
      water("w1", "2026-04-07T10:00:00.000Z"),
      env("e1", "2026-04-07T10:00:01.000Z", { humidity_pct: 150 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const inner = screen.getByTestId("manual-snapshot-timeline-card");
    expect(["warning", "invalid"]).toContain(inner.getAttribute("data-severity"));
  });

  it("invalid telemetry stays visible in expanded environment subcard", async () => {
    nextRows = [
      water("w1", "2026-04-08T10:00:00.000Z"),
      env("e1", "2026-04-08T10:00:01.000Z", { humidity_pct: 150 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const card = screen.getByTestId("quick-log-grouped-card");
    fireEvent.click(within(card).getByTestId("quick-log-grouped-audit-toggle"));
    const subcard = within(card).getByTestId(
      "quick-log-grouped-audit-environment-subcard",
    );
    const inner = within(subcard).getByTestId("manual-snapshot-timeline-card");
    expect(["warning", "invalid"]).toContain(inner.getAttribute("data-severity"));
  });
});

describe("Grouped Timeline Audit Toggle — invariants", () => {
  it("grouped env event does not also render as standalone when expanded", async () => {
    nextRows = [
      water("w1", "2026-04-09T10:00:00.000Z"),
      env("e1", "2026-04-09T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    fireEvent.click(screen.getByTestId("quick-log-grouped-audit-toggle"));
    expect(screen.getAllByTestId("manual-snapshot-timeline-card")).toHaveLength(1);
    const kinds = screen
      .getAllByTestId("quick-log-grouped-card")
      .map((c) => c.getAttribute("data-entry-kind"));
    expect(kinds).toEqual(["grouped"]);
  });

  it("ordering remains deterministic after toggling", async () => {
    nextRows = [
      water("w-old", "2026-04-10T08:00:00.000Z"),
      env("e-mid", "2026-04-10T09:00:00.000Z", { humidity_pct: 60 }),
      water("w-new", "2026-04-10T10:00:00.000Z"),
      env("e-new", "2026-04-10T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const orderBefore = screen
      .getAllByTestId("quick-log-grouped-card")
      .map((c) => c.getAttribute("data-occurred-at"));
    fireEvent.click(screen.getByTestId("quick-log-grouped-audit-toggle"));
    const orderAfterExpand = screen
      .getAllByTestId("quick-log-grouped-card")
      .map((c) => c.getAttribute("data-occurred-at"));
    expect(orderAfterExpand).toEqual(orderBefore);
    fireEvent.click(screen.getByTestId("quick-log-grouped-audit-toggle"));
    const orderAfterCollapse = screen
      .getAllByTestId("quick-log-grouped-card")
      .map((c) => c.getAttribute("data-occurred-at"));
    expect(orderAfterCollapse).toEqual(orderBefore);
  });

  it("no live/synced/connected/imported wording when expanded", async () => {
    nextRows = [
      water("w1", "2026-04-11T10:00:00.000Z"),
      env("e1", "2026-04-11T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    fireEvent.click(screen.getByTestId("quick-log-grouped-audit-toggle"));
    const text =
      screen
        .getByTestId("quick-log-grouped-timeline-section")
        .textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/\blive\b/);
    expect(text).not.toMatch(/\bsynced\b/);
    expect(text).not.toMatch(/\bconnected\b/);
    expect(text).not.toMatch(/\bimported\b/);
  });
});
