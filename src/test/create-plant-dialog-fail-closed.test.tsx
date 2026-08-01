import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CreatePlantDialog from "@/components/CreatePlantDialog";

const insertSpy = vi.fn();
const growsMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (...args: unknown[]) => {
        insertSpy(...args);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: "p-new", name: "Plant" }, error: null }),
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
  useTents: () => ({
    data: [
      { id: "33333333-3333-4333-8333-333333333333", name: "Orphan tent", grow_id: null },
      { id: "44444444-4444-4444-8444-444444444444", name: "Good tent", grow_id: GROW_ID },
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Other tent",
        grow_id: "66666666-6666-4666-8666-666666666666",
      },
    ],
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({
  trackFunnelEvent: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/CreateTentDialog", () => ({
  default: () => null,
}));

function renderDialog(
  props: {
    defaultTentId?: string;
    defaultGrowId?: string;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CreatePlantDialog
          trigger={<button type="button">Open plant</button>}
          defaultTentId={props.defaultTentId}
          defaultGrowId={props.defaultGrowId}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  insertSpy.mockClear();
  growsMock.mockReset();
});

describe("CreatePlantDialog fail-closed", () => {
  it("zero-grow renders hard stop and blocks submit", async () => {
    growsMock.mockReturnValue({ grows: [], activeGrowId: null, loading: false });
    renderDialog();
    fireEvent.click(screen.getByText("Open plant"));
    expect(await screen.findByTestId("create-plant-hard-stop")).toBeInTheDocument();
    const submit = screen.getByTestId("plant-create-submit");
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Leaf" },
    });
    fireEvent.click(submit);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("with an active grow, submit includes grow_id", async () => {
    growsMock.mockReturnValue({
      grows: [{ id: GROW_ID, name: "Spring" }],
      activeGrowId: GROW_ID,
      loading: false,
    });
    renderDialog();
    fireEvent.click(screen.getByText("Open plant"));
    expect(await screen.findByTestId("create-plant-target-setup")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Plant A" },
    });
    fireEvent.click(screen.getByTestId("plant-create-submit"));
    await vi.waitFor(() => expect(insertSpy).toHaveBeenCalled());
    const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(GROW_ID);
  });

  it("orphan default tent with active grow blocks submit and shows Finish setup CTA", async () => {
    growsMock.mockReturnValue({
      grows: [
        { id: GROW_ID, name: "Spring" },
        { id: "66666666-6666-4666-8666-666666666666", name: "Fall" },
      ],
      activeGrowId: GROW_ID,
      loading: false,
    });
    renderDialog({
      defaultTentId: "33333333-3333-4333-8333-333333333333",
      defaultGrowId: undefined,
    });
    fireEvent.click(screen.getByText("Open plant"));
    expect(await screen.findByTestId("create-plant-tent-mismatch")).toBeInTheDocument();
    const finishLink = screen.getByTestId("create-plant-finish-setup-cta");
    expect(finishLink.getAttribute("href")).toBe("/grow-lineage");
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Plant A" },
    });
    fireEvent.click(screen.getByTestId("plant-create-submit"));
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("cancel then reopen starts with a clean form", async () => {
    growsMock.mockReturnValue({
      grows: [{ id: GROW_ID, name: "Spring" }],
      activeGrowId: GROW_ID,
      loading: false,
    });
    renderDialog();
    fireEvent.click(screen.getByText("Open plant"));
    const input = await screen.findByPlaceholderText("Plant A");
    fireEvent.change(input, { target: { value: "Stale plant" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByText("Open plant"));
    expect(screen.getByPlaceholderText("Plant A")).toHaveValue("");
  });
});
