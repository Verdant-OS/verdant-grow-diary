/**
 * An unbroken early-stage "What changed" note must wrap inside the card.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import TimelineMemorySection from "@/components/TimelineMemorySection";

const LONG_NOTE = "Y".repeat(180);

let nextResponse: { data: unknown[] | null; error: unknown } = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery() {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.is = () => q;
    q.order = () => q;
    q.limit = () => Promise.resolve(nextResponse);
    return q;
  }
  return { supabase: { from: () => makeQuery() } };
});

beforeEach(() => {
  nextResponse = {
    data: [
      {
        id: "early-long",
        plant_id: "plant-1",
        tent_id: "tent-1",
        entry_at: "2026-03-01T10:00:00.000Z",
        note: "Saw the tap root.",
        photo_url: null,
        details: {
          event_type: "note",
          early_stage: {
            early_stage_milestone: "taproot_visible",
            vigor: "strong",
            notes: LONG_NOTE,
            stage_context: "germination",
          },
        },
      },
    ],
    error: null,
  };
});

describe("early-stage note wrap", () => {
  it("wraps an unbroken What changed note inside the card", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <TimelineMemorySection scope="plant" plantId="plant-1" />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("timeline-diary-early-stage-note")).toBeInTheDocument(),
    );
    const note = screen.getByTestId("timeline-diary-early-stage-note");
    expect(note.textContent).toContain(LONG_NOTE);
    expect(note.className).toContain("[overflow-wrap:anywhere]");
    expect(note.className).toContain("min-w-0");
    expect(note.className).toContain("max-w-full");
  });
});
