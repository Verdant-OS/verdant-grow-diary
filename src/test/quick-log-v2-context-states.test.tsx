/**
 * QuickLogV2Sheet — empty / loading / error context-state audit tests.
 *
 * Verifies that when plants/tents cannot be loaded, are loading, or are
 * empty, the sheet:
 *  - communicates the state clearly,
 *  - never lets Save attempt a write,
 *  - offers a clear next action (Retry or Add plant/tent).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));

const plantsState: {
  data: unknown[];
  isLoading: boolean;
  isError: boolean;
  refetch: ReturnType<typeof vi.fn>;
} = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
const tentsState: typeof plantsState = {
  data: [],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock("@/hooks/use-plants", () => ({ usePlants: () => plantsState }));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => tentsState }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpcMock.mockReset();
  plantsState.data = [];
  plantsState.isLoading = false;
  plantsState.isError = false;
  plantsState.refetch = vi.fn();
  tentsState.data = [];
  tentsState.isLoading = false;
  tentsState.isError = false;
  tentsState.refetch = vi.fn();
});
afterEach(() => cleanup());

describe("QuickLogV2Sheet — loading state", () => {
  it("shows loading status and disables Save while context loads", () => {
    plantsState.isLoading = true;
    renderSheet();
    expect(screen.getByTestId("qlv2-context-loading")).toBeTruthy();
    expect(
      (screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("loading status uses role=status (implicit polite announcement)", () => {
    tentsState.isLoading = true;
    renderSheet();
    const node = screen.getByTestId("qlv2-context-loading");
    expect(node.getAttribute("role")).toBe("status");
  });
});

describe("QuickLogV2Sheet — fetch error state", () => {
  it("renders retry-friendly error alert and disables Save", () => {
    plantsState.isError = true;
    renderSheet();
    const err = screen.getByTestId("qlv2-context-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(
      (screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("Retry calls refetch on both plants and tents queries", () => {
    plantsState.isError = true;
    tentsState.isError = true;
    renderSheet();
    fireEvent.click(screen.getByTestId("qlv2-context-retry"));
    expect(plantsState.refetch).toHaveBeenCalledTimes(1);
    expect(tentsState.refetch).toHaveBeenCalledTimes(1);
  });
});

describe("QuickLogV2Sheet — empty plant + tent lists", () => {
  it("shows clear empty-state with Add plant / Add tent CTAs", () => {
    renderSheet();
    expect(screen.getByTestId("qlv2-context-empty")).toBeTruthy();
    const plantCta = screen.getByTestId(
      "qlv2-context-empty-add-plant",
    ) as HTMLAnchorElement;
    const tentCta = screen.getByTestId(
      "qlv2-context-empty-add-tent",
    ) as HTMLAnchorElement;
    expect(plantCta.getAttribute("href")).toBe("/plants");
    expect(tentCta.getAttribute("href")).toBe("/tents");
    expect(plantCta.className).toMatch(/min-h-11/);
    expect(tentCta.className).toMatch(/min-h-11/);
  });

  it("Save is disabled and no RPC is dispatched when there are no targets", () => {
    renderSheet();
    const save = screen.getByTestId("qlv2-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("QuickLogV2Sheet — happy path still enables Save", () => {
  it("with plants present and no error/loading, Save is enabled", () => {
    plantsState.data = [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
    ];
    tentsState.data = [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }];
    renderSheet();
    expect(screen.queryByTestId("qlv2-context-loading")).toBeNull();
    expect(screen.queryByTestId("qlv2-context-error")).toBeNull();
    expect(screen.queryByTestId("qlv2-context-empty")).toBeNull();
    expect(
      (screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe("QuickLogV2Sheet — photo gate (not enabled)", () => {
  it("selecting Photo action shows the gate message with role=status", () => {
    plantsState.data = [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
    ];
    tentsState.data = [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }];
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /photo/i }));
    const gate = screen.getByTestId("qlv2-photo-gate");
    expect(gate).toBeTruthy();
    expect(gate.getAttribute("role")).toBe("status");
    expect(gate.textContent).toMatch(/Photo saving is not enabled yet/i);
  });

  it("Photo gate uses the helper copy and aria-label", () => {
    plantsState.data = [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
    ];
    tentsState.data = [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }];
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /photo/i }));
    const gate = screen.getByTestId("qlv2-photo-gate");
    expect(gate.getAttribute("aria-label")).toMatch(/unavailable/i);
    expect(gate.textContent).toMatch(/future update/i);
  });

  it("does not render Take Photo or Choose from Library buttons", () => {
    plantsState.data = [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
    ];
    tentsState.data = [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }];
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /photo/i }));
    expect(
      screen.queryByRole("button", { name: /take photo/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /choose from library/i }),
    ).toBeNull();
  });

  it("does not render any file input when Photo is selected", () => {
    plantsState.data = [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
    ];
    tentsState.data = [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }];
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /photo/i }));
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("Save shows gate error and does not dispatch RPC when Photo action is selected", () => {
    plantsState.data = [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
    ];
    tentsState.data = [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }];
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /photo/i }));
    const save = screen.getByTestId("qlv2-save") as HTMLButtonElement;
    fireEvent.click(save);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(
      /Photo saving is not enabled yet/i,
    );
  });
});
