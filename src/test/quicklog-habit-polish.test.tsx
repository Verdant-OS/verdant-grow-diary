/**
 * QuickLog — Gate 1 habit-capture polish tests.
 *
 * Presentation-only assertions for the polish slice:
 *   - Subtitle, section labels (Plant / Observation / Optional details)
 *   - Prompt chips update local note without saving
 *   - Save helper copy + accessible save name
 *   - Manual readings subtitle + collapsed-by-default behavior
 *   - Static scan: no new functions.invoke, alert/action_queue writes,
 *     model clients, device-control copy, service_role, bridge tokens,
 *     or fake-live copy in this component.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Test Grow", stage: "veg" }],
    activeGrow: { id: "grow-1", name: "Test Grow", stage: "veg" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Test Plant", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true });
});

describe("QuickLog habit-capture polish — presentation", () => {
  it("renders title and subtitle", () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByText(/Quick Log/i).length).toBeGreaterThan(0);
    // Current intended subtitle copy emphasizes single-target / single-save habit.
    expect(within(dialog).getByTestId("quick-log-subtitle").textContent).toMatch(
      /One target\..*One save\./i,
    );
  });

  it("renders Plant target card and Observation + Optional details section labels", () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    // Plant section is presented as the target card (no numbered prefix).
    expect(screen.getByTestId("quick-log-target-card")).toBeInTheDocument();
    expect(screen.getByTestId("quick-log-section-observation")).toBeInTheDocument();
    expect(screen.getByTestId("quick-log-section-optional")).toBeInTheDocument();
  });

  it("renders all 7 prompt chips", () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    const group = screen.getByTestId("quick-log-prompt-chips");
    for (const label of [
      "Better",
      "Same",
      "Worse",
      "Watered",
      "Fed",
      "Spotted issue",
      "Photo only",
    ]) {
      expect(within(group).getByText(label)).toBeInTheDocument();
    }
  });

  it("clicking Better/Same/Worse updates the local note and does NOT save", () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    const note = screen.getByTestId("quicklog-note") as HTMLTextAreaElement;

    fireEvent.click(screen.getByTestId("quick-log-chip-better"));
    expect(note.value).toMatch(/Better than yesterday/);

    fireEvent.click(screen.getByTestId("quick-log-chip-same"));
    expect(note.value).toMatch(/About the same/);

    fireEvent.click(screen.getByTestId("quick-log-chip-worse"));
    expect(note.value).toMatch(/Looking worse/);

    expect(saveMock).not.toHaveBeenCalled();
  });

  it("save button keeps clear 'Save entry' copy and renders helper line", () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    const save = screen.getByTestId("quick-log-save");
    expect(save.textContent).toMatch(/Save entry|Save log/);
    expect(screen.getByTestId("quick-log-save-helper").textContent).toMatch(
      /add more detail later from the timeline/i,
    );
  });

  it("Manual readings subtitle is present and section is collapsed by default when empty", () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    const section = screen.getByTestId("quicklog-hardware-readings");
    expect(section.getAttribute("data-open")).toBe("false");
    expect(screen.getByTestId("quicklog-hardware-manual-subtitle").textContent).toMatch(
      /Manual readings/i,
    );
    expect(screen.getByTestId("quicklog-hardware-manual-subtitle").textContent).toMatch(
      /not telemetry/i,
    );
  });

  it("note textarea has an accessible label", () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    const note = screen.getByTestId("quicklog-note");
    expect(note.getAttribute("aria-label")).toBe("Quick log observation note");
  });

  it("prompt chip buttons expose explicit aria labels", () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    const chip = screen.getByTestId("quick-log-chip-watered");
    expect(chip.getAttribute("aria-label")).toBe("Insert observation: Watered");
  });
});

describe("QuickLog habit-capture polish — static safety", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../components/QuickLog.tsx"),
    "utf8",
  );

  it("does not introduce alert/action_queue writes, model clients, or device control", () => {
    expect(SRC).not.toMatch(/from\(['"]alerts['"]\)/);
    expect(SRC).not.toMatch(/from\(['"]action_queue['"]\)/);
    expect(SRC).not.toMatch(/openai|anthropic|model\.invoke|model_client/i);
    expect(SRC).not.toMatch(/service_role|SERVICE_ROLE/);
    expect(SRC).not.toMatch(/bridge.?token|BRIDGE_TOKEN/i);
    expect(SRC).not.toMatch(/turn on|turn off|run pump|run fan|run light|relay|actuator/i);
  });

  it("manual readings copy explicitly clarifies it is not telemetry", () => {
    expect(SRC).toMatch(/not telemetry/i);
  });

  it("save path still routes through useQuickLogV2Save (no new functions.invoke)", () => {
    expect(SRC).toMatch(/useQuickLogV2Save/);
    expect(SRC).not.toMatch(/functions\.invoke/);
  });
});
