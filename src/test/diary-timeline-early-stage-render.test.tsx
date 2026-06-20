/**
 * Diary timeline early-stage rendering — verifies that saved Quick Log
 * germination/seedling milestone, vigor, note, and stage context appear
 * as read-only chips in the timeline memory section, without leaking
 * raw payload keys or service_role/token fields, and that non-early
 * entries continue to render unchanged.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import TimelineMemorySection from "@/components/TimelineMemorySection";

type Row = {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  entry_at: string;
  note: string | null;
  photo_url: string | null;
  details: unknown;
};

let nextResponse: { data: Row[] | null; error: unknown } = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery() {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.order = () => q;
    q.limit = () => Promise.resolve(nextResponse);
    return q;
  }
  return { supabase: { from: () => makeQuery() } };
});

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TimelineMemorySection scope="plant" plantId="plant-1" />
    </QueryClientProvider>,
  );
}

const KNOWN_ROW: Row = {
  id: "early-known",
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
      notes: "Tap root through the paper towel.",
      stage_context: "germination",
    },
  },
};

const UNKNOWN_ROW: Row = {
  id: "early-unknown",
  plant_id: "plant-1",
  tent_id: "tent-1",
  entry_at: "2026-03-02T10:00:00.000Z",
  note: "Something happened.",
  photo_url: null,
  details: {
    event_type: "note",
    early_stage: {
      early_stage_milestone: "totally_made_up_milestone",
      vigor: "super_extra_vigor",
      notes: null,
      stage_context: "weird_unknown_stage",
      // Hostile extras must NOT leak into the DOM.
      service_role_key: "should-not-render",
      raw_payload: { token: "nope" },
    },
  },
};

const PLAIN_ROW: Row = {
  id: "plain-note",
  plant_id: "plant-1",
  tent_id: "tent-1",
  entry_at: "2026-03-03T10:00:00.000Z",
  note: "Regular note.",
  photo_url: null,
  details: { event_type: "note" },
};

beforeEach(() => {
  nextResponse = { data: [], error: null };
});

describe("TimelineMemorySection — early-stage rendering", () => {
  it("renders milestone, vigor, stage and note for a known early-stage entry", async () => {
    nextResponse = { data: [KNOWN_ROW], error: null };
    renderSection();
    await waitFor(() =>
      expect(screen.getByTestId("timeline-memory-day-groups")).toBeInTheDocument(),
    );

    expect(screen.getByTestId("timeline-diary-early-stage")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-diary-early-stage-milestone").textContent).toMatch(
      /Milestone: Taproot visible/,
    );
    expect(screen.getByTestId("timeline-diary-early-stage-vigor").textContent).toMatch(
      /Vigor: Strong/,
    );
    expect(screen.getByTestId("timeline-diary-early-stage-stage").textContent).toMatch(
      /Stage: Germination/,
    );
    expect(screen.getByTestId("timeline-diary-early-stage-note").textContent).toMatch(
      /What changed: Tap root through the paper towel\./,
    );
  });

  it("renders safe fallbacks for unknown milestone/vigor and drops unknown stage", async () => {
    nextResponse = { data: [UNKNOWN_ROW], error: null };
    renderSection();
    await waitFor(() =>
      expect(screen.getByTestId("timeline-memory-day-groups")).toBeInTheDocument(),
    );

    const milestone = screen.getByTestId("timeline-diary-early-stage-milestone");
    const vigor = screen.getByTestId("timeline-diary-early-stage-vigor");
    expect(milestone.textContent).toMatch(/Milestone: Milestone logged/);
    expect(vigor.textContent).toMatch(/Vigor: Vigor noted/);
    expect(
      screen.queryByTestId("timeline-diary-early-stage-stage"),
    ).not.toBeInTheDocument();

    const section = screen.getByTestId("timeline-memory-section");
    const html = section.innerHTML;
    // Raw enum values and hostile extras must never reach the DOM.
    expect(html).not.toContain("totally_made_up_milestone");
    expect(html).not.toContain("super_extra_vigor");
    expect(html).not.toContain("weird_unknown_stage");
    expect(html).not.toContain("service_role_key");
    expect(html).not.toContain("should-not-render");
    expect(html).not.toContain("raw_payload");
    expect(html.toLowerCase()).not.toContain("token");
  });

  it("does not render the early-stage chips for a plain non-early entry", async () => {
    nextResponse = { data: [PLAIN_ROW], error: null };
    renderSection();
    await waitFor(() =>
      expect(screen.getByTestId("timeline-memory-day-groups")).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("timeline-diary-early-stage"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("timeline-diary-early-stage-milestone"),
    ).not.toBeInTheDocument();
  });
});
