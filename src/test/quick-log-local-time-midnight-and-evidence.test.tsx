/**
 * #1949 follow-ups: the Quick Log timeline's Today / Yesterday headings must
 * roll over at local midnight while the page stays open, and the AI Doctor
 * Phase 1 evidence card must not show a raw UTC instant next to its local
 * "Saved date". Stored instants stay UTC (kept in <time dateTime>).
 *
 * Each case sets process.env.TZ and proves it took effect with a round-trip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MemoryRouter } from "@/lib/react-router-compat";

import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";
import { AiDoctorPhase1TimelineEvidenceCard } from "@/components/AiDoctorPhase1TimelineEvidenceCard";
import { buildAiDoctorPhase1TimelineEvidenceViewModel } from "@/lib/aiDoctorPhase1TimelineEvidenceViewModel";
import { AI_DOCTOR_PHASE1_TIMELINE_KIND } from "@/lib/aiDoctorPhase1TimelineDraft";

let nextRows: unknown[] = [];
const ORIGINAL_TZ = process.env.TZ;

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery() {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "not", "in", "or", "order"]) q[m] = () => q;
    q.limit = () => Promise.resolve({ data: nextRows, error: null });
    return q;
  }
  return { supabase: { from: () => makeQuery() } };
});

// The midnight clock, driven by the test instead of a real timer.
const midnight = vi.hoisted(() => ({ tick: null as null | (() => void) }));
vi.mock("@/hooks/useTimelineGrowDayNow", () => ({
  useTimelineGrowDayNow: () => {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
      midnight.tick = () => setNow(new Date());
    }, []);
    return now;
  },
}));

beforeEach(() => {
  nextRows = [];
  process.env.TZ = "America/Chicago";
});

afterEach(() => {
  vi.useRealTimers();
  midnight.tick = null;
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("Quick Log timeline day headings across local midnight", () => {
  it("relabels Today as Yesterday once the local day changes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 21, 23, 50));
    expect(new Date(2026, 9, 21, 10, 53).toISOString()).toBe("2026-10-21T15:53:00.000Z");
    nextRows = [
      {
        id: "obs-1",
        plant_id: "plant-1",
        tent_id: "tent-1",
        occurred_at: "2026-10-21T15:53:00.000Z",
        event_type: "observation",
        source: "manual",
        note: "Checked the canopy.",
      },
    ];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <QuickLogGroupedTimelineSection scope="tent" tentId="tent-1" />
      </QueryClientProvider>,
    );
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    expect(screen.getByTestId("quick-log-grouped-timeline-day-label").textContent).toBe("Today");

    vi.setSystemTime(new Date(2026, 9, 22, 0, 5));
    act(() => midnight.tick?.());
    expect(screen.getByTestId("quick-log-grouped-timeline-day-label").textContent).toBe(
      "Yesterday",
    );
  });
});

describe("AI Doctor Phase 1 evidence card saved time", () => {
  it("shows the local saved time, never the raw UTC instant", () => {
    const stored = "2026-10-09T02:30:00.000Z";
    expect(new Date(2026, 9, 8, 21, 30).toISOString()).toBe(stored);
    const vm = buildAiDoctorPhase1TimelineEvidenceViewModel({
      id: "evt-1",
      plant_id: "plant-1",
      grow_id: "grow-1",
      tent_id: "tent-1",
      occurred_at: stored,
      details: {
        kind: AI_DOCTOR_PHASE1_TIMELINE_KIND,
        result: { summary: "Lower leaves yellowing.", evidence: [], missing_information: [] },
      },
    })!;
    render(
      <MemoryRouter>
        <AiDoctorPhase1TimelineEvidenceCard viewModel={vm} />
      </MemoryRouter>,
    );
    const saved = screen.getByTestId("ai-doctor-phase1-timeline-evidence-card-occurred-at");
    expect(saved.textContent).toBe("Saved: Oct 8, 2026, 9:30 PM");
    expect(saved.querySelector("time")?.getAttribute("dateTime")).toBe(stored);
    const card = screen.getByTestId("ai-doctor-phase1-timeline-evidence-card");
    expect(card.textContent).not.toContain(stored);
    expect(card.textContent).not.toMatch(/\bUTC\b/);
  });
});
