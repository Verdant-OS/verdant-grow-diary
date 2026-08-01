import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { growSetup } from "@/constants/growSetupMessages";

const insertMock = vi.fn();
const singleMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (...args: unknown[]) => {
        insertMock(...args);
        return {
          select: () => ({
            single: singleMock,
          }),
        };
      },
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const growsState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  activeGrowId: null as string | null,
  loading: false,
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => growsState,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [], isLoading: false }),
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

import CreateTentDialog from "@/components/CreateTentDialog";

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreateTentDialog initiallyOpen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CreateTentDialog fail-closed binding", () => {
  beforeEach(() => {
    insertMock.mockReset();
    singleMock.mockReset();
    growsState.grows = [];
    growsState.activeGrowId = null;
    growsState.loading = false;
  });

  it("renders the zero-grow hard stop and blocks submit", () => {
    renderDialog();

    const banner = screen.getByTestId("tent-create-setup-hard-stop");
    expect(banner).toHaveAttribute("aria-label", growSetup.noSetup.bannerAriaLabel);
    expect(banner).toHaveTextContent(growSetup.noSetup.title);
    expect(screen.getByTestId("tent-create-start-room")).toHaveAttribute(
      "href",
      "/grows?intent=one_tent_activation",
    );
    expect(screen.getByText(growSetup.noSetup.ctaDismiss)).toBeInTheDocument();
    expect(screen.queryByTestId("tent-create-submit")).not.toBeInTheDocument();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("includes grow_id when an active setup is available", async () => {
    growsState.grows = [{ id: "grow-active", name: "Spring Veg" }];
    growsState.activeGrowId = "grow-active";
    singleMock.mockResolvedValue({ data: { id: "tent-1", name: "Tent #1" }, error: null });

    renderDialog();

    expect(screen.queryByTestId("tent-create-setup-hard-stop")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("tent-create-name"), {
      target: { value: "Tent #1" },
    });
    fireEvent.click(screen.getByTestId("tent-create-submit"));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });
    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.grow_id).toBe("grow-active");
    expect(payload.name).toBe("Tent #1");
  });

  it("starts clean when reopened after close", () => {
    growsState.grows = [{ id: "grow-active", name: "Spring Veg" }];
    growsState.activeGrowId = "grow-active";

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreateTentDialog key="open-1" initiallyOpen />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByTestId("tent-create-name"), {
      target: { value: "Stale name" },
    });

    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreateTentDialog key="open-2" initiallyOpen />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect((screen.getByTestId("tent-create-name") as HTMLInputElement).value).toBe("");
  });
});
