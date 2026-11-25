/**
 * The Back button on a saved AI Doctor review must never be a dead end.
 *
 * A review opened from a copied link or in a fresh tab has no earlier
 * Verdant page, so Back opens the saved reviews list. When the grower did
 * arrive from another Verdant page, Back still returns there.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";

function makeRow(): AiDoctorSessionRow {
  return {
    id: "sess-back",
    created_at: "2026-05-28T10:00:00Z",
    plant_id: "p1",
    tent_id: "t1",
    grow_id: "g1",
    question: "Why are leaves curling?",
    diagnosis: null,
    raw_confidence: null,
    displayed_confidence: null,
    context_confidence_ceiling: null,
    suggested_actions: [],
  };
}

let currentRow: AiDoctorSessionRow | null = makeRow();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => {
              const __c: any = {
                abortSignal: () => __c,
                then: (r: any, j?: any) => Promise.resolve({ data: [], error: null }).then(r, j),
              };
              return __c;
            },
          }),
          maybeSingle: () => Promise.resolve({ data: currentRow, error: null }),
        }),
      }),
    }),
  },
}));

function renderAt(entries: string[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/doctor/sessions/:sessionId" element={<AiDoctorSessionDetail />} />
          <Route path="/doctor/sessions" element={<p>Saved reviews list</p>} />
          <Route path="/plants/:id" element={<p>Plant page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function pressBack() {
  const back = await screen.findByRole("button", { name: /^back$/i });
  await act(async () => {
    back.click();
  });
}

describe("AiDoctorSessionDetail — Back is never a dead end", () => {
  beforeEach(() => {
    currentRow = makeRow();
    window.history.replaceState(null, "");
  });

  afterEach(() => {
    window.history.replaceState(null, "");
  });

  it("opens the saved reviews list when the review is the first page in the tab", async () => {
    window.history.replaceState({ __TSR_index: 0 }, "");
    renderAt(["/doctor/sessions/sess-back"]);
    await pressBack();
    expect(await screen.findByText("Saved reviews list")).toBeInTheDocument();
  });

  it("opens the saved reviews list when there is no router history state", async () => {
    renderAt(["/doctor/sessions/sess-back"]);
    await pressBack();
    expect(await screen.findByText("Saved reviews list")).toBeInTheDocument();
  });

  it("returns to the earlier Verdant page when there is one", async () => {
    window.history.replaceState({ __TSR_index: 3 }, "");
    renderAt(["/plants/p1", "/doctor/sessions/sess-back"]);
    await pressBack();
    expect(await screen.findByText("Plant page")).toBeInTheDocument();
    expect(screen.queryByText("Saved reviews list")).toBeNull();
  });
});
