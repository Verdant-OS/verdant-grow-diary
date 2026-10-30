import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "QA plant", tent_id: "tent-1", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "QA tent", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "QA grow", is_archived: false }] }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "fahrenheit",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={() => {}} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

describe("restored Feed observation notice", () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(cleanup);

  it("explains that the visible Feed note came from an unsaved draft", async () => {
    const first = renderSheet();
    expect(screen.queryByTestId("qlv2-draft-restored")).not.toBeInTheDocument();
    fireEvent.change(await screen.findByTestId("qlv2-note"), {
      target: { value: "Runoff looked cloudy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    await waitFor(() => {
      const drafts = Array.from({ length: window.sessionStorage.length }, (_, index) => {
        const key = window.sessionStorage.key(index);
        return key ? window.sessionStorage.getItem(key) : "";
      }).join("");
      expect(drafts).toContain('"action":"feed"');
    });
    first.unmount();

    renderSheet();
    expect(await screen.findByLabelText("Feeding note (optional)")).toHaveValue(
      "Runoff looked cloudy",
    );
    expect(screen.getByTestId("qlv2-draft-restored")).toHaveTextContent(
      "Restored your unsaved entry for this target.",
    );
    expect(screen.getByTestId("qlv2-draft-restored")).toBeVisible();
  });
});
