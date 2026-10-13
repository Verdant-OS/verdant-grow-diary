/**
 * Demo rows join the local-day group that matches their stored instant.
 *
 * Appending a Mar 16 demo after a Mar 14 row left it under the Sat, Mar 14
 * heading. Screen readers that jump by heading then read that demo as Mar 14.
 * The demo stays a direct list item. Stored instants stay UTC.
 *
 * Timezone-sensitive labels set process.env.TZ. The first assertion proves
 * UTC is active: local noon on Mar 16 2026 is the stored instant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogGroupedTimelineSection, {
  type DemoQuickLogTimelineEntry,
} from "@/components/QuickLogGroupedTimelineSection";
import { orderQuickLogTimelineDemosIntoLocalDays } from "@/lib/quickLogGroupedTimelineFilterViewModel";
import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";

type Row = {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  occurred_at: string;
  event_type: string;
  source: string;
  note: string | null;
};

let nextRows: Row[] = [];
const ORIGINAL_TZ = process.env.TZ;

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery() {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.is = () => q;
    q.not = () => q;
    q.in = () => q;
    q.or = () => q;
    q.order = () => q;
    q.limit = () => Promise.resolve({ data: nextRows, error: null });
    return q;
  }
  return { supabase: { from: () => makeQuery() } };
});

beforeEach(() => {
  nextRows = [];
  process.env.TZ = "UTC";
});

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const PLANT = "plant-demo-day-group";
const TENT = "tent-demo-day-group";

function renderSection(props: Parameters<typeof QuickLogGroupedTimelineSection>[0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <QuickLogGroupedTimelineSection {...props} />
    </QueryClientProvider>,
  );
}

function row(id: string, occurredAt: string, eventType: "watering" | "observation"): Row {
  return {
    id,
    plant_id: PLANT,
    tent_id: TENT,
    occurred_at: occurredAt,
    event_type: eventType,
    source: "manual",
    note: eventType === "observation" ? "Checked the canopy." : null,
  };
}

function demoOn(occurredAt: string, id: string): DemoQuickLogTimelineEntry {
  const entry: QuickLogTimelineEntry = {
    kind: "action",
    occurredAt,
    actionSourceLabel: "Manual",
    action: {
      id,
      kind: "note",
      source: "manual",
      plantId: PLANT,
      tentId: TENT,
      occurredAt,
      noteText: "Demo note.",
    },
  };
  return { entry, variant: "demo" };
}

function listItems(): Element[] {
  const list = screen.getByTestId("quick-log-grouped-timeline-list");
  return [...list.querySelectorAll(":scope > li")];
}

describe("Quick Log timeline demo local-day groups", () => {
  it("proves TZ=UTC, then places a Mar 16 demo before the Mar 14 heading", async () => {
    expect(new Date(2026, 2, 16, 12, 0, 0, 0).toISOString()).toBe("2026-03-16T12:00:00.000Z");
    nextRows = [
      row("newer", "2026-03-16T12:00:00.000Z", "watering"),
      row("older", "2026-03-14T12:00:00.000Z", "observation"),
    ];
    renderSection({
      scope: "plant",
      plantId: PLANT,
      tentId: TENT,
      demoEntries: [demoOn("2026-03-16T15:00:00.000Z", "demo-mar-16")],
    });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));

    const labels = screen.getAllByTestId("quick-log-grouped-timeline-day-label");
    expect(labels.map((label) => label.textContent)).toEqual(["Mon, Mar 16", "Sat, Mar 14"]);

    const items = listItems();
    expect(items.map((item) => item.getAttribute("data-local-day"))).toEqual([
      "2026-03-16",
      "2026-03-16",
      "2026-03-14",
    ]);
    const demoItem = screen.getByTestId("quick-log-grouped-action-demo-source").closest("li");
    const mar14Item = labels[1]?.closest("li") ?? null;
    expect(demoItem).not.toBeNull();
    expect(items.indexOf(demoItem as Element)).toBeGreaterThan(-1);
    expect(items.indexOf(demoItem as Element)).toBeLessThan(items.indexOf(mar14Item as Element));
    expect(demoItem?.getAttribute("data-local-day")).toBe("2026-03-16");
    expect(
      demoItem?.querySelector("[data-testid='quick-log-grouped-timeline-day-label']"),
    ).toBeNull();
  });

  it("gives a demo-only local day its own heading between the surrounding days", async () => {
    expect(new Date(2026, 2, 15, 12, 0, 0, 0).toISOString()).toBe("2026-03-15T12:00:00.000Z");
    nextRows = [
      row("newer", "2026-03-16T12:00:00.000Z", "watering"),
      row("older", "2026-03-14T12:00:00.000Z", "observation"),
    ];
    renderSection({
      scope: "plant",
      plantId: PLANT,
      tentId: TENT,
      demoEntries: [demoOn("2026-03-15T12:00:00.000Z", "demo-mar-15")],
    });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));

    const labels = screen.getAllByTestId("quick-log-grouped-timeline-day-label");
    expect(labels.map((label) => label.textContent)).toEqual([
      "Mon, Mar 16",
      "Sun, Mar 15",
      "Sat, Mar 14",
    ]);
    const items = listItems();
    expect(items.map((item) => item.getAttribute("data-local-day"))).toEqual([
      "2026-03-16",
      "2026-03-15",
      "2026-03-14",
    ]);
    const demoItem = screen.getByTestId("quick-log-grouped-action-demo-source").closest("li");
    expect(
      demoItem?.querySelector("[data-testid='quick-log-grouped-timeline-day-label']")?.textContent,
    ).toBe("Sun, Mar 15");
  });
});

describe("orderQuickLogTimelineDemosIntoLocalDays", () => {
  const row = (id: string, occurredAt: string, demo: boolean) => ({ id, occurredAt, demo });

  it("keeps real rows in place when there is no demo", () => {
    const items = [row("a", "2026-03-16T12:00:00.000Z", false), row("b", "not-a-date", false)];
    expect(
      orderQuickLogTimelineDemosIntoLocalDays(
        items,
        (item) => item.occurredAt,
        (item) => item.demo,
      ),
    ).toEqual(items);
  });

  it("keeps demo order on a shared day and leaves an unreadable demo last", () => {
    const items = [
      row("real-16", "2026-03-16T12:00:00.000Z", false),
      row("real-14", "2026-03-14T12:00:00.000Z", false),
      row("demo-b", "2026-03-16T18:00:00.000Z", true),
      row("demo-a", "2026-03-16T09:00:00.000Z", true),
      row("demo-bad", "not-a-date", true),
    ];
    expect(
      orderQuickLogTimelineDemosIntoLocalDays(
        items,
        (item) => item.occurredAt,
        (item) => item.demo,
      ).map((item) => item.id),
    ).toEqual(["real-16", "demo-b", "demo-a", "real-14", "demo-bad"]);
  });
});
