/**
 * Tent page Quick Log list and Quick Log snapshot strip show the viewer's
 * local time, not UTC (QA bug B, production 05f5138d: the tent page showed
 * "Oct 21, 2026, 15:53 UTC" and "8:29 PM UTC" where the plant page shows
 * "10:51 AM CDT"-style local labels).
 *
 * Regression lineage: #2206 and #2014 (earlier UTC-display fixes on other
 * surfaces). This file pins the two formatters those fixes did not reach:
 * `formatQuickLogOccurredAt` (grouped Quick Log list, mounted by
 * `src/pages/TentDetail.tsx` as `<QuickLogGroupedTimelineSection scope="tent">`)
 * and `formatCapturedAtAbsolute` (snapshot strip "Captured: …" label).
 *
 * Determinism: each case pins `process.env.TZ` and proves the zone took
 * effect before asserting, then restores the caller's zone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";
import { formatQuickLogOccurredAt } from "@/lib/quickLogGroupedTimelineFilterViewModel";
import {
  buildQuickLogSnapshotStrip,
  formatCapturedAtAbsolute,
} from "@/lib/quickLogSnapshotStripAdapter";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";

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

const TENT = "tent-1";
const ENTRY_INSTANT = "2026-10-21T15:53:00Z";
const STRIP_INSTANT = "2026-10-21T20:29:00Z";

let savedTz: string | undefined;

function useZone(tz: string): void {
  process.env.TZ = tz;
}

beforeEach(() => {
  savedTz = process.env.TZ;
  nextRows = [];
});

afterEach(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

function renderTentSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <QuickLogGroupedTimelineSection scope="tent" tentId={TENT} />
    </QueryClientProvider>,
  );
}

describe("tent Quick Log times follow the viewer's zone (America/Chicago)", () => {
  beforeEach(() => {
    useZone("America/Chicago");
    // Proves the zone took effect: local 10:53 on Oct 21 is 15:53Z under CDT.
    expect(new Date(2026, 9, 21, 10, 53).toISOString()).toBe("2026-10-21T15:53:00.000Z");
  });

  it("tent-scoped grouped list labels the entry 10:53 AM CDT and never UTC", async () => {
    nextRows = [
      {
        id: "e-1",
        plant_id: null,
        tent_id: TENT,
        occurred_at: ENTRY_INSTANT,
        event_type: "observation",
        source: "manual",
        note: "Checked runoff.",
      },
    ];
    const { container } = renderTentSection();
    const ts = await screen.findByTestId("quick-log-grouped-action-occurred-at");
    expect(ts.textContent).toBe("Oct 21, 2026, 10:53 AM CDT");
    expect(container.textContent ?? "").not.toMatch(/UTC/);
  });

  it("formatQuickLogOccurredAt returns the local label with a short zone name", () => {
    expect(formatQuickLogOccurredAt(ENTRY_INSTANT)).toBe("Oct 21, 2026, 10:53 AM CDT");
  });

  it("snapshot strip captured-at label is 3:29 PM CDT and never UTC", () => {
    expect(formatCapturedAtAbsolute(STRIP_INSTANT)).toBe("Oct 21, 2026, 3:29 PM CDT");
    const v = buildQuickLogSnapshotStrip({
      snapshot: {
        ...EMPTY_SNAPSHOT,
        source: "manual",
        ts: STRIP_INSTANT,
        temp: 24,
        rh: 55,
        vpd: 1.32,
      },
      hasTent: true,
      now: new Date("2026-10-21T20:34:00Z"),
      temperatureUnit: "celsius",
    });
    expect(v.capturedAtLabel).toBe("Oct 21, 2026, 3:29 PM CDT");
    expect(v.capturedAtLabel ?? "").not.toMatch(/UTC/);
  });
});

describe("output follows the zone, it is not hard-coded", () => {
  it("TZ=UTC renders the same instants in UTC", () => {
    useZone("UTC");
    expect(new Date(2026, 9, 21, 15, 53).toISOString()).toBe("2026-10-21T15:53:00.000Z");
    expect(formatQuickLogOccurredAt(ENTRY_INSTANT)).toBe("Oct 21, 2026, 3:53 PM UTC");
    expect(formatCapturedAtAbsolute(STRIP_INSTANT)).toBe("Oct 21, 2026, 8:29 PM UTC");
  });
});

describe("null / empty / unparseable inputs are unchanged", () => {
  it("formatQuickLogOccurredAt passes invalid input through and blanks empty input", () => {
    useZone("America/Chicago");
    expect(formatQuickLogOccurredAt(null)).toBe("");
    expect(formatQuickLogOccurredAt(undefined)).toBe("");
    expect(formatQuickLogOccurredAt("")).toBe("");
    expect(formatQuickLogOccurredAt("not-a-date")).toBe("not-a-date");
  });

  it("formatCapturedAtAbsolute returns null for null, empty and unparseable input", () => {
    useZone("America/Chicago");
    expect(formatCapturedAtAbsolute(null)).toBeNull();
    expect(formatCapturedAtAbsolute(undefined)).toBeNull();
    expect(formatCapturedAtAbsolute("")).toBeNull();
    expect(formatCapturedAtAbsolute("not-a-date")).toBeNull();
  });
});
