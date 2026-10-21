/**
 * Regression for the 2026-10-21 QA report on production 05f5138d (after
 * #2206 and #2014 were closed): the tent page's Quick Log list labelled
 * entries "Oct 21, 2026, 15:53 UTC" and its snapshot strip "8:29 PM UTC".
 * Both must use the viewer's local clock. Stored instants stay UTC.
 *
 * Each case sets process.env.TZ and first proves it took effect with a
 * round-trip of the local wall clock to the stored instant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";
import { formatCapturedAtAbsolute } from "@/lib/quickLogSnapshotStripAdapter";

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
  process.env.TZ = "America/Chicago";
});

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const TENT = "tent-local-time";
const STORED_1553_UTC = "2026-10-21T15:53:00.000Z";

describe("tent Quick Log list and snapshot strip use local time", () => {
  it("labels a tent Quick Log entry in local time, never UTC", async () => {
    expect(new Date(2026, 9, 21, 10, 53, 0, 0).toISOString()).toBe(STORED_1553_UTC);
    nextRows = [
      {
        id: "obs-1",
        plant_id: "plant-1",
        tent_id: TENT,
        occurred_at: STORED_1553_UTC,
        event_type: "observation",
        source: "manual",
        note: "Checked the canopy.",
      },
    ];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <QuickLogGroupedTimelineSection scope="tent" tentId={TENT} />
      </QueryClientProvider>,
    );
    const list = await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    expect(screen.getByTestId("quick-log-grouped-action-occurred-at").textContent).toBe(
      "Oct 21, 2026, 10:53 AM",
    );
    expect(list.textContent).not.toMatch(/\bUTC\b/);
  });

  it("labels the snapshot strip's capture in local time, never UTC", () => {
    const stored = "2026-10-22T01:29:00.000Z";
    expect(new Date(2026, 9, 21, 20, 29, 0, 0).toISOString()).toBe(stored);
    expect(formatCapturedAtAbsolute(stored)).toBe("Oct 21, 2026, 8:29 PM");
    expect(formatCapturedAtAbsolute("not-a-date")).toBeNull();
    expect(formatCapturedAtAbsolute(null)).toBeNull();
  });
});
