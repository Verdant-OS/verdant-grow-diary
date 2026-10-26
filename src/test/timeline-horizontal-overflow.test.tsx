/**
 * Timeline notes and the page shell must not widen the document.
 * An unbroken note uses overflow-wrap: anywhere, and the page clips
 * horizontal overflow so the stage strip scrolls inside itself.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import TimelineMemorySection from "@/components/TimelineMemorySection";

const TIMELINE_SRC = readFileSync(resolve(__dirname, "../pages/Timeline.tsx"), "utf8");
const MEMORY_SECTION_SRC = readFileSync(
  resolve(__dirname, "../components/TimelineMemorySection.tsx"),
  "utf8",
);

vi.mock("@/integrations/supabase/client", () => {
  const row = {
    id: "note-long",
    plant_id: "plant-1",
    tent_id: "tent-1",
    entry_at: "2026-01-01T10:00:00.000Z",
    note: "X".repeat(500),
    photo_url: null,
    details: { event_type: "note" },
  };
  function makeQuery() {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.is = () => q;
    q.not = () => q;
    q.in = () => q;
    q.or = () => q;
    q.order = () => q;
    q.limit = () => Promise.resolve({ data: [row], error: null });
    return q;
  }
  return {
    supabase: {
      from: () => makeQuery(),
    },
  };
});

describe("timeline horizontal overflow", () => {
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => {
    cleanup();
  });

  it("wraps an unbroken diary note inside the memory card", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <TimelineMemorySection scope="plant" plantId="plant-1" />
      </QueryClientProvider>,
    );
    const note = await screen.findByText("X".repeat(500));
    expect(note.className).toContain("[overflow-wrap:anywhere]");
    expect(note.className).toContain("min-w-0");
    expect(note.className).toContain("max-w-full");

    const row = note.closest('[data-testid="timeline-memory-diary-item"]');
    expect(row).toBeTruthy();
    expect(row?.className).toContain("min-w-0");
    expect(row?.className).toContain("max-w-full");
  });

  it("pins overflow-safe classes on the memory diary row shell", () => {
    expect(MEMORY_SECTION_SRC).toContain('data-testid="timeline-memory-diary-item"');
    expect(MEMORY_SECTION_SRC).toMatch(
      /data-testid="timeline-memory-diary-item"[\s\S]{0,400}className="[^"]*min-w-0[^"]*max-w-full/,
    );
    expect(MEMORY_SECTION_SRC).toContain("[overflow-wrap:anywhere]");
  });

  it("keeps the Timeline page from growing sideways and wraps entry notes", () => {
    expect(TIMELINE_SRC).toContain('<div className="min-w-0 max-w-full overflow-x-clip">');
    expect(TIMELINE_SRC).toContain("min-w-0 max-w-full overflow-x-auto");
    const body = TIMELINE_SRC.match(
      /data-testid="timeline-entry-body"[\s\S]{0,500}className="([^"]+)"|className="([^"]+)"[\s\S]{0,250}data-testid="timeline-entry-body"/,
    );
    const className = body?.[1] ?? body?.[2] ?? "";
    expect(className).toContain("[overflow-wrap:anywhere]");
    expect(className).toContain("min-w-0");
    expect(className).toContain("max-w-full");
  });
});
