import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CreateTentDialog from "@/components/CreateTentDialog";

const insertSpy = vi.fn();
const growsMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (...args: unknown[]) => {
        insertSpy(...args);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: "t-new", name: "Tent" }, error: null }),
          }),
        };
      },
    }),
  },
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GROW_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: USER_ID } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => growsMock(),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [] }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { multiTent: true } },
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({
  trackFunnelEvent: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CreateTentDialog trigger={<button type="button">Open tent</button>} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  insertSpy.mockClear();
  growsMock.mockReset();
});

describe("CreateTentDialog fail-closed", () => {
  it("zero-grow renders hard stop and blocks submit", async () => {
    growsMock.mockReturnValue({ grows: [], activeGrowId: null, loading: false });
    renderDialog();
    fireEvent.click(screen.getByText("Open tent"));
    expect(await screen.findByTestId("create-tent-hard-stop")).toBeInTheDocument();
    const submit = screen.getByTestId("tent-create-submit");
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), {
      target: { value: "My tent" },
    });
    fireEvent.click(submit);
    expect(insertSpy).not.toHaveBeenCalled();
    const startLink = screen.getByTestId("create-tent-start-room-cta");
    expect(startLink.getAttribute("href")).toBe("/grows?intent=one_tent_activation");
  });

  it("with an active grow, submit includes grow_id", async () => {
    growsMock.mockReturnValue({
      grows: [{ id: GROW_ID, name: "Spring" }],
      activeGrowId: GROW_ID,
      loading: false,
    });
    renderDialog();
    fireEvent.click(screen.getByText("Open tent"));
    expect(await screen.findByTestId("create-tent-target-setup")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), {
      target: { value: "Tent A" },
    });
    fireEvent.click(screen.getByTestId("tent-create-submit"));
    await vi.waitFor(() => expect(insertSpy).toHaveBeenCalled());
    const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(GROW_ID);
  });

  it("cancel then reopen starts with a clean form", async () => {
    growsMock.mockReturnValue({
      grows: [{ id: GROW_ID, name: "Spring" }],
      activeGrowId: GROW_ID,
      loading: false,
    });
    renderDialog();
    fireEvent.click(screen.getByText("Open tent"));
    const input = await screen.findByPlaceholderText("Tent #1");
    fireEvent.change(input, { target: { value: "Stale name" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByText("Open tent"));
    expect(screen.getByPlaceholderText("Tent #1")).toHaveValue("");
  });
});
