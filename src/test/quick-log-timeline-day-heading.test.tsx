/**
 * Day headings on the Quick Log grouped timeline.
 *
 * A later demo row on a local day that already has a heading must not
 * print that heading again. Each first heading is an h4 so screen readers
 * can jump by day. Stored instants stay UTC.
 *
 * Timezone-sensitive labels set process.env.TZ, the same pattern as
 * timeline-date-range-rules.test.ts. The first assertion proves UTC is
 * active: local noon on Mar 16 2026 is the stored instant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogGroupedTimelineSection, {
  type DemoQuickLogTimelineEntry,
} from "@/components/QuickLogGroupedTimelineSection";
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

const PLANT = "plant-day-heading";
const TENT = "tent-day-heading";

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

describe("Quick Log timeline day headings", () => {
  it("proves TZ=UTC, then does not repeat a day heading for a later demo row", async () => {
    expect(new Date(2026, 2, 16, 12, 0, 0, 0).toISOString()).toBe("2026-03-16T12:00:00.000Z");
    nextRows = [
      row("newer", "2026-03-16T12:00:00.000Z", "watering"),
      row("older", "2026-03-14T12:00:00.000Z", "observation"),
    ];
    renderSection({
      scope: "plant",
      plantId: PLANT,
      tentId: TENT,
      demoEntries: [demoOn("2026-03-16T15:00:00.000Z", "demo-same-day")],
    });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));

    const labels = screen.getAllByTestId("quick-log-grouped-timeline-day-label");
    expect(labels.map((label) => label.textContent)).toEqual(["Mon, Mar 16", "Sat, Mar 14"]);
    for (const label of labels) {
      expect(label.tagName).toBe("H4");
      expect(label.getAttribute("id")).toBeTruthy();
    }
    expect(labels[0]?.getAttribute("id")).toMatch(/-day-2026-03-16$/);
    expect(labels[1]?.getAttribute("id")).toMatch(/-day-2026-03-14$/);

    const list = screen.getByTestId("quick-log-grouped-timeline-list");
    const items = list.querySelectorAll(":scope > li");
    expect(items).toHaveLength(3);
    const demoCard = screen.getByTestId("quick-log-grouped-action-demo-source");
    expect(demoCard.textContent).toBe("Demo data");
    const demoItem = demoCard.closest("li");
    expect(demoItem?.getAttribute("data-local-day")).toBe("2026-03-16");
    expect(
      demoItem?.querySelector("[data-testid='quick-log-grouped-timeline-day-label']"),
    ).toBeNull();
  });

  it("uses one heading for consecutive entries on the same local day", async () => {
    expect(new Date(2026, 2, 16, 12, 0, 0, 0).toISOString()).toBe("2026-03-16T12:00:00.000Z");
    nextRows = [
      row("later", "2026-03-16T18:00:00.000Z", "observation"),
      row("earlier", "2026-03-16T12:00:00.000Z", "watering"),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));

    const labels = screen.getAllByTestId("quick-log-grouped-timeline-day-label");
    expect(labels).toHaveLength(1);
    expect(labels[0]?.tagName).toBe("H4");
    expect(labels[0]?.textContent).toBe("Mon, Mar 16");
    const list = screen.getByTestId("quick-log-grouped-timeline-list");
    expect(list.querySelectorAll(":scope > li")).toHaveLength(2);
  });
});
