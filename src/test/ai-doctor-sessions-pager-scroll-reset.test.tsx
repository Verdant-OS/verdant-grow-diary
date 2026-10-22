/**
 * #2348 review: search-param chips keep the scroll position (filming bug
 * #16), but a page transition replaces the results, so the AI Doctor Sessions
 * pager must still reset scroll by passing `preventScrollReset: false`.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const setSearchParamsSpy = vi.fn();
let currentSearch = "page=2";

vi.mock("@/lib/react-router-compat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/react-router-compat")>();
  return {
    ...actual,
    useSearchParams: (() => [
      new URLSearchParams(currentSearch),
      setSearchParamsSpy,
    ]) as unknown as typeof actual.useSearchParams,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({}) }) },
}));

vi.mock("@/hooks/use-ai-doctor-sessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-ai-doctor-sessions")>();
  return {
    ...actual,
    useAiDoctorSessionsIndex: () => ({
      data: {
        rows: [
          {
            id: "session-1",
            created_at: "2026-10-20T12:00:00.000Z",
            plant_id: null,
            tent_id: null,
            grow_id: null,
            question: "Leaf tips curling",
            diagnosis: null,
            raw_confidence: null,
            displayed_confidence: null,
            context_confidence_ceiling: null,
            suggested_actions: [],
          },
        ],
        hasMore: true,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    }),
  };
});

vi.mock("@/hooks/useAiDoctorSessionReviews", () => ({
  useAiDoctorSessionReviews: () => ({ data: { stateBySession: null } }),
}));

async function renderSessionsIndex() {
  const { default: AiDoctorSessionsIndex } = await import("@/pages/AiDoctorSessionsIndex");
  const { MemoryRouter } = await import("@/lib/react-router-compat");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/doctor/sessions?${currentSearch}`]}>
        <AiDoctorSessionsIndex />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByTestId("ai-doctor-sessions-index-pager");
}

describe("AI Doctor Sessions pager scroll", () => {
  it.each([
    ["Next", "ai-doctor-sessions-index-next"],
    ["Previous", "ai-doctor-sessions-index-prev"],
  ])("%s resets scroll to the top", async (_label, testId) => {
    setSearchParamsSpy.mockClear();
    await renderSessionsIndex();
    fireEvent.click(screen.getByTestId(testId));
    expect(setSearchParamsSpy).toHaveBeenCalledTimes(1);
    expect(setSearchParamsSpy.mock.calls[0][1]).toEqual({
      replace: true,
      preventScrollReset: false,
    });
  });
});

describe("AI Doctor Sessions saved-view scroll", () => {
  const chip = "ai-doctor-sessions-index-needs-follow-up-visible-chip";

  it("a saved view that changes the page resets scroll", async () => {
    currentSearch = "page=2";
    setSearchParamsSpy.mockClear();
    await renderSessionsIndex();
    fireEvent.click(screen.getByTestId(chip));
    expect(setSearchParamsSpy).toHaveBeenCalledTimes(1);
    expect((setSearchParamsSpy.mock.calls[0][0] as URLSearchParams).get("page")).toBeNull();
    expect(setSearchParamsSpy.mock.calls[0][1]).toEqual({
      replace: true,
      preventScrollReset: false,
    });
  });

  it("a saved view on the same page keeps the scroll position", async () => {
    currentSearch = "";
    setSearchParamsSpy.mockClear();
    await renderSessionsIndex();
    fireEvent.click(screen.getByTestId(chip));
    expect(setSearchParamsSpy).toHaveBeenCalledTimes(1);
    expect(setSearchParamsSpy.mock.calls[0][1]).toEqual({ replace: true });
  });
});
