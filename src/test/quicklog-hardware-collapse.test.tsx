/**
 * QuickLog — Hardware readings collapse-by-default behavior (Gate 1 UI
 * slice). Pure presenter change: no schema/RLS/RPC/save-path touched.
 *
 * Contract:
 *  1. Default collapsed when all hardware/sensor fields are empty.
 *  2. Default expanded when any field already has a value (e.g. prefill).
 *  3. User toggle is respected for the remainder of the open session.
 *  4. Reopen recomputes the default from current values.
 *  5. Source labels / copy unchanged (no fake live language).
 *  6. Save payload unchanged (RPC contract intact).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import QuickLog from "@/components/QuickLog";
import {
  computeQuickLogHardwareDefaultOpen,
  hasAnyHardwareReading,
} from "@/lib/quickLogHardwareReadingsRules";

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const saveMock = vi.fn();
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: (...a: unknown[]) => saveMock(...a),
    saving: false,
    error: null,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: vi.fn() }),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "G", stage: "veg" }],
    activeGrow: { id: "g1", name: "G", stage: "veg" },
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "p1", name: "P", tent_id: "t1", grow_id: "g1" }],
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true });
});

describe("computeQuickLogHardwareDefaultOpen (pure helper)", () => {
  it("returns false when no hardware values are present", () => {
    expect(computeQuickLogHardwareDefaultOpen({})).toBe(false);
    expect(computeQuickLogHardwareDefaultOpen(null)).toBe(false);
    expect(
      computeQuickLogHardwareDefaultOpen({
        inputPh: "",
        inputEc: "",
        runoffPh: "  ",
      }),
    ).toBe(false);
  });
  it("returns true when at least one hardware value is present", () => {
    expect(computeQuickLogHardwareDefaultOpen({ inputPh: "6.2" })).toBe(true);
    expect(computeQuickLogHardwareDefaultOpen({ ppfdCanopy: "650" })).toBe(true);
  });
  it("matches hasAnyHardwareReading for the same input", () => {
    const samples = [
      {},
      { inputPh: "6.2" },
      { runoffEc: "1.5" },
      { lightDistance: "" },
    ];
    for (const s of samples) {
      expect(computeQuickLogHardwareDefaultOpen(s)).toBe(hasAnyHardwareReading(s));
    }
  });
});

describe("QuickLog Hardware readings collapse-by-default", () => {
  it("defaults collapsed when all hardware fields are empty", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const section = screen.getByTestId("quicklog-hardware-readings");
    expect(section.getAttribute("data-open")).toBe("false");
    expect(screen.queryByTestId("quicklog-hardware-helper")).toBeNull();
    const toggle = screen.getByTestId("quicklog-hardware-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("respects the user's manual toggle while the sheet remains open", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const toggle = screen.getByTestId("quicklog-hardware-toggle");
    fireEvent.click(toggle);
    expect(screen.getByTestId("quicklog-hardware-readings").getAttribute("data-open")).toBe(
      "true",
    );
    expect(screen.getByTestId("quicklog-hardware-helper")).toBeInTheDocument();
    // Re-renders that flow through hardware state (e.g. typing) must NOT
    // collapse it again.
    fireEvent.click(toggle);
    expect(screen.getByTestId("quicklog-hardware-readings").getAttribute("data-open")).toBe(
      "false",
    );
  });

  it("recomputes the default on reopen", () => {
    const { rerender } = renderWithClient(
      <QuickLog open onOpenChange={vi.fn()} />,
    );
    // expand, then close
    fireEvent.click(screen.getByTestId("quicklog-hardware-toggle"));
    expect(
      screen.getByTestId("quicklog-hardware-readings").getAttribute("data-open"),
    ).toBe("true");
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <QuickLog open={false} onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <QuickLog open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    // Empty values → collapsed default restored on reopen.
    expect(
      screen.getByTestId("quicklog-hardware-readings").getAttribute("data-open"),
    ).toBe("false");
  });

  it("does not introduce fake live/sensor copy in the section header", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const section = screen.getByTestId("quicklog-hardware-readings");
    const text = section.textContent ?? "";
    expect(text).not.toMatch(/\blive data\b|\blive sensor\b|guaranteed/i);
  });

  it("save payload is unchanged when the section is left collapsed", async () => {
    renderWithClient(
      <QuickLog
        open
        onOpenChange={vi.fn()}
        prefill={{ plantId: "p1", growId: "g1" }}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Looking healthy" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0][0];
    expect(payload.p_action).toBe("note");
    expect(payload.p_note).toBe("Looking healthy");
    // No hardware-readings block was appended.
    expect(payload.p_note).not.toMatch(/Hardware readings/);
  });
});
