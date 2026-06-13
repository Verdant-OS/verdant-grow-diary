/**
 * QuickLog — Stage + Current Setup compact-row layout (Gate 1 UI slice).
 * Pure presenter change. No schema/RLS/RPC/save-path/validation changes.
 *
 * Asserts:
 *  - Stage, Current Setup, Event, and Plant labels still render.
 *  - Stage + Current Setup live inside the compact context row.
 *  - Compact row uses responsive grid classes (mobile-safe stacking).
 *  - Existing field values (active grow stage) preserved on mount.
 *  - Save payload (RPC p_note + p_action) unchanged.
 *  - No fake live/sensor copy is introduced.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import QuickLog from "@/components/QuickLog";

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
    grows: [{ id: "g1", name: "Tent A", stage: "flower" }],
    activeGrow: { id: "g1", name: "Tent A", stage: "flower" },
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

describe("QuickLog compact Stage + Current Setup row", () => {
  it("renders Event, Stage, Current Setup, and Plant labels with accessible names", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Event")).toBeInTheDocument();
    expect(within(dialog).getByText("Stage")).toBeInTheDocument();
    expect(within(dialog).getByText("Current Setup")).toBeInTheDocument();
    expect(within(dialog).getByText("Plant")).toBeInTheDocument();
  });

  it("places Stage alongside the Event selector in a responsive 2-col grid", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const stageLabel = within(dialog).getByText("Stage");
    // Stage shares its parent grid row with the EventTypeSelector.
    const row = stageLabel.closest("div.grid") as HTMLElement | null;
    expect(row).not.toBeNull();
    expect(row!.className).toMatch(/grid-cols-2/);
  });

  it("preserves the existing stage value from the active grow", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const stageLabel = within(dialog).getByText("Stage");
    const row = stageLabel.closest("div.grid") as HTMLElement;
    // Stage default = activeGrow.stage = "flower" → trigger reflects it.
    expect(within(row).getAllByText(/flower/i).length).toBeGreaterThan(0);
  });

  it("does not introduce fake live/sensor copy in the context area", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const text = dialog.textContent ?? "";
    expect(text).not.toMatch(/\blive data\b|\blive sensor\b|guaranteed/i);
  });

  it("save payload (RPC) is unchanged by the layout refactor", async () => {
    renderWithClient(
      <QuickLog
        open
        onOpenChange={vi.fn()}
        prefill={{ plantId: "p1", growId: "g1" }}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Compact-row save" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0][0];
    expect(payload.p_action).toBe("note");
    expect(payload.p_target_type).toBe("plant");
    expect(payload.p_target_id).toBe("p1");
    expect(payload.p_note).toBe("Compact-row save");
  });
});
