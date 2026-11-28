/**
 * Quick Log · typing "What changed?" clears a rejected-save alert, and the
 * validation preview prefers a trimmed Short note over the early note (#3113).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { toast } from "sonner";
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
      insert: vi.fn(),
      update: () => ({ eq: vi.fn() }),
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
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Test Grow", stage: "seedling" }],
    activeGrow: { id: "grow-1", name: "Test Grow", stage: "seedling" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: "plant-1",
        name: "Test Plant",
        tent_id: "tent-1",
        grow_id: "grow-1",
        created_at: new Date().toISOString(),
      },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true });
  vi.mocked(toast.error).mockReset();
});

function openQuickLog() {
  renderWithClient(
    <QuickLog open onOpenChange={vi.fn()} prefill={{ plantId: "plant-1", growId: "grow-1" }} />,
  );
  return screen.getByRole("dialog");
}

describe("Quick Log · What changed? clears a rejected save", () => {
  it("clears the save error when What changed? is typed after a rejected save", async () => {
    const dialog = openQuickLog();
    fireEvent.click(within(dialog).getByTestId("quick-log-save"));

    const alert = await within(dialog).findByTestId("quick-log-save-error");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveTextContent("Add a quick note");

    fireEvent.change(within(dialog).getByTestId("quick-log-early-stage-notes"), {
      target: { value: "popped soil" },
    });
    expect(within(dialog).queryByTestId("quick-log-save-error")).toBeNull();

    fireEvent.click(within(dialog).getByTestId("quick-log-save"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0][0].p_note).toBe("Early note: popped soil");
  });

  it("does not show the missing-note hint when Short note has text and What changed? is empty", () => {
    const dialog = openQuickLog();
    fireEvent.change(within(dialog).getByTestId("quicklog-note"), {
      target: { value: "day 4" },
    });
    expect(within(dialog).queryByTestId("quicklog-preview")?.textContent ?? "").not.toContain(
      "Add a quick note before saving.",
    );
  });

  it("does not show the missing-note hint when Short note is whitespace and What changed? has text", () => {
    const dialog = openQuickLog();
    fireEvent.change(within(dialog).getByTestId("quicklog-note"), {
      target: { value: "   " },
    });
    fireEvent.change(within(dialog).getByTestId("quick-log-early-stage-notes"), {
      target: { value: "popped soil" },
    });
    expect(within(dialog).queryByTestId("quicklog-preview")?.textContent ?? "").not.toContain(
      "Add a quick note before saving.",
    );
  });
});
