/**
 * PlantLabResultsPanel — render behavior.
 *
 * The load-bearing case: the panel must be QUIETLY ABSENT whenever the read
 * is unavailable — most importantly when the lab_tests migration has not
 * been applied to the target database yet (the repo's chronic migration-apply
 * gap). Merged app code must never error a Plant Detail page whose database
 * doesn't have the table.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// Result the mocked query chain resolves with; set per-test.
const queryResult: { current: { data: unknown; error: unknown } } = {
  current: { data: [], error: null },
};

// Thenable self-returning chain so any number of .order() calls works.
const chain = {
  order: () => chain,
  then: (resolve: (v: unknown) => void) => resolve(queryResult.current),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => chain }),
      insert: async () => ({ error: null }),
      delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" }, session: null, loading: false }),
}));

import PlantLabResultsPanel from "@/components/PlantLabResultsPanel";
import { LAB_RESULTS_EMPTY_COPY } from "@/lib/labResultsRules";

describe("PlantLabResultsPanel", () => {
  beforeEach(() => {
    cleanup();
    queryResult.current = { data: [], error: null };
  });

  it("renders nothing without a plantId", () => {
    render(<PlantLabResultsPanel plantId={null} />);
    expect(screen.queryByTestId("plant-lab-results-panel")).toBeNull();
  });

  it("stays quietly absent when the read errors (migration not applied)", async () => {
    queryResult.current = {
      data: null,
      error: { code: "42P01", message: 'relation "public.lab_tests" does not exist' },
    };
    render(<PlantLabResultsPanel plantId="p1" />);
    // Give the query a tick to settle, then confirm the panel never appeared.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByTestId("plant-lab-results-panel")).toBeNull();
  });

  it("shows the empty state and Add button once the table is reachable", async () => {
    queryResult.current = { data: [], error: null };
    render(<PlantLabResultsPanel plantId="p1" />);
    const empty = await screen.findByTestId("plant-lab-results-empty");
    expect(empty.textContent).toBe(LAB_RESULTS_EMPTY_COPY);
    expect(screen.getByTestId("plant-lab-results-add")).toBeTruthy();
  });

  it("renders result cards with entered values and labeled calculated totals", async () => {
    queryResult.current = {
      data: [
        {
          id: "t1",
          tested_at: "2026-08-01T00:00:00.000Z",
          thca_percent: 24,
          thc_percent: 0.5,
          cbda_percent: null,
          cbd_percent: null,
          terpenes: { myrcene: 0.8 },
          lab_name: "Green Labs",
          note: null,
        },
      ],
      error: null,
    };
    render(<PlantLabResultsPanel plantId="p1" />);
    const card = await screen.findByTestId("plant-lab-result-card");
    expect(card.textContent).toContain("THCa 24%");
    expect(card.textContent).toContain("Total THC (calculated) 21.55%");
    expect(card.textContent).toContain("myrcene 0.8%");
    expect(card.textContent).toContain("Green Labs");
    expect(screen.getByTestId("plant-lab-results-panel").getAttribute("data-count")).toBe("1");
  });

  it("delete button carries an accessible name identifying the result", async () => {
    queryResult.current = {
      data: [
        {
          id: "t1",
          tested_at: "2026-08-01T00:00:00.000Z",
          created_at: null,
          thca_percent: 24,
          thc_percent: null,
          cbda_percent: null,
          cbd_percent: null,
          terpenes: {},
          lab_name: null,
          note: null,
        },
      ],
      error: null,
    };
    render(<PlantLabResultsPanel plantId="p1" />);
    const del = await screen.findByTestId("plant-lab-result-delete");
    expect(del.getAttribute("aria-label")).toBe("Delete lab result from Aug 1, 2026");
  });

  it("readOnly: shows saved evidence without add/delete controls", async () => {
    queryResult.current = {
      data: [
        {
          id: "t1",
          tested_at: "2026-08-01T00:00:00.000Z",
          created_at: "2026-08-02T10:00:00.000Z",
          thca_percent: 24,
          thc_percent: null,
          cbda_percent: null,
          cbd_percent: null,
          terpenes: {},
          lab_name: null,
          note: null,
        },
      ],
      error: null,
    };
    render(<PlantLabResultsPanel plantId="p1" readOnly />);
    const panel = await screen.findByTestId("plant-lab-results-panel");
    expect(panel.getAttribute("data-readonly")).toBe("true");
    expect(screen.getByTestId("plant-lab-result-card")).toBeTruthy();
    expect(screen.queryByTestId("plant-lab-results-add")).toBeNull();
    expect(screen.queryByTestId("plant-lab-result-delete")).toBeNull();
  });

  it("readOnly: renders nothing at all when the plant has no lab results", async () => {
    queryResult.current = { data: [], error: null };
    render(<PlantLabResultsPanel plantId="p1" readOnly />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByTestId("plant-lab-results-panel")).toBeNull();
  });
});
