/**
 * FieldNotebookScope must pass each tent's readings through to the card
 * (Cheek, 2026-11-24): the scope had no `readingsByTent` prop, so every tile
 * read "—" even when the tent had a fresh reading.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FieldNotebookScope } from "@/components/FieldNotebookMount";
import { clearNotebookSession } from "@/lib/fieldNotebookSession";
import type { ReadingSlot } from "@/lib/fieldNotebookViewModel";

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn(async () => ({ data: null })) }) }),
    }),
  },
}));

const CAPTURED_MS = Date.parse("2026-11-24T11:57:00.000Z");

function slot(over: Partial<ReadingSlot> & Pick<ReadingSlot, "label">): ReadingSlot {
  return {
    value: null,
    source: null,
    ageLabel: null,
    capturedAtMs: null,
    ...over,
  };
}

function renderScope(readingsByTent?: Record<string, ReadingSlot[]>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FieldNotebookScope
        growsLoading={false}
        growId="grow-1"
        tents={[{ id: "flower", name: "Flower Tent 2" }]}
        readingsByTent={readingsByTent}
      />
    </QueryClientProvider>,
  );
}

function tiles() {
  return Array.from(screen.getByTestId("field-notebook-readings").children) as HTMLElement[];
}

describe("FieldNotebookScope readings", () => {
  beforeEach(() => {
    clearNotebookSession();
  });

  it("shows the tent's readings with their source and age on the card", () => {
    renderScope({
      flower: [
        slot({
          label: "TEMP",
          value: "75.2°F",
          source: "Live",
          ageLabel: "3m ago",
          capturedAtMs: CAPTURED_MS,
        }),
        slot({
          label: "RH",
          value: "0%",
          source: "Live",
          ageLabel: "3m ago",
          capturedAtMs: CAPTURED_MS,
        }),
      ],
    });
    const [temp, rh] = tiles();
    expect(within(temp).getByText("75.2°F")).toBeInTheDocument();
    expect(within(temp).getByText("Live · 3m ago")).toBeInTheDocument();
    // Zero is a real reading, not a missing one.
    expect(within(rh).getByText("0%")).toBeInTheDocument();
  });

  it("shows a stale reading as Stale", () => {
    renderScope({
      flower: [
        slot({
          label: "TEMP",
          value: "75.0°F",
          source: "Stale",
          ageLabel: "14d ago",
          capturedAtMs: CAPTURED_MS,
        }),
      ],
    });
    const [temp] = tiles();
    expect(within(temp).getByText("75.0°F")).toBeInTheDocument();
    expect(within(temp).getByText("Stale · 14d ago")).toBeInTheDocument();
  });

  it("leaves the tiles empty when no readings are passed", () => {
    renderScope();
    expect(tiles()).toHaveLength(4);
    // No tile carries a source and age line.
    expect(screen.getByTestId("field-notebook-readings").textContent).not.toContain(" · ");
  });
});
