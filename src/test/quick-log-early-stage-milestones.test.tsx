/**
 * Quick Log early-stage milestone integration tests.
 *
 * Confirms:
 *  - germination/seedling stage surfaces milestone + vigor chips
 *  - non-early-stage (veg) hides the section by default
 *  - selecting a milestone & vigor writes them through the EXISTING
 *    quicklog_save_manual RPC payload as p_details.early_stage, and
 *    appends a human-readable suffix to the note
 *  - photo is recommended, not required (no upload runs)
 *  - no Supabase diary_entries insert, no Action Queue write, no
 *    device-control or automation strings are introduced by the slice
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
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

const insertMock = vi.fn();
const uploadMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: insertMock,
      update: () => ({ eq: vi.fn() }),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: uploadMock, remove: vi.fn() }) },
  },
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

const stageRef = { current: "seedling" as string };
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Test Grow", stage: stageRef.current }],
    activeGrow: { id: "grow-1", name: "Test Grow", stage: stageRef.current },
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

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true });
  insertMock.mockReset();
  uploadMock.mockReset();
  stageRef.current = "seedling";
});

describe("Quick Log · early-stage milestone presets", () => {
  it("shows milestone + vigor chips when the active grow is seedling stage", () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    const section = screen.getByTestId("quick-log-early-stage-section");
    expect(section).toHaveAttribute("data-visibility", "visible");
    expect(
      within(section).getByTestId("quick-log-early-stage-milestone-cotyledons_open"),
    ).toBeInTheDocument();
    expect(
      within(section).getByTestId("quick-log-early-stage-vigor-strong"),
    ).toBeInTheDocument();
    expect(
      within(section).getByTestId("quick-log-early-stage-photo-hint").textContent,
    ).toMatch(/recommended/i);
  });

  it("hides the section by default for veg-stage plants", () => {
    stageRef.current = "veg";
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    expect(screen.queryByTestId("quick-log-early-stage-section")).toBeNull();
  });

  it("writes early_stage envelope + note suffix through the existing RPC", async () => {
    renderWithClient(
      <QuickLog
        open
        onOpenChange={vi.fn()}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByTestId("quick-log-early-stage-milestone-cotyledons_open"),
    );
    fireEvent.click(within(dialog).getByTestId("quick-log-early-stage-vigor-strong"));
    fireEvent.change(within(dialog).getByTestId("quick-log-early-stage-notes"), {
      target: { value: "popped soil" },
    });
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "day 4" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0][0];
    expect(payload.p_action).toBe("note");
    expect(payload.p_target_type).toBe("plant");
    expect(payload.p_details).toMatchObject({
      early_stage: {
        early_stage_milestone: "cotyledons_open",
        vigor: "strong",
        notes: "popped soil",
        stage_context: "seedling",
      },
    });
    expect(payload.p_note).toContain("day 4");
    expect(payload.p_note).toContain("Milestone: Cotyledons open");
    expect(payload.p_note).toContain("Vigor: Strong");
    // Photo recommended but not required — no upload happens.
    expect(uploadMock).not.toHaveBeenCalled();
    // No diary_entries direct insert — single save path is the RPC.
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("saves vigor-only selection without a milestone", async () => {
    renderWithClient(
      <QuickLog
        open
        onOpenChange={vi.fn()}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByTestId("quick-log-early-stage-vigor-weak"));
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "leggy stretch" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0][0];
    expect(payload.p_details.early_stage).toMatchObject({
      early_stage_milestone: null,
      vigor: "weak",
    });
    expect(payload.p_note).toContain("Vigor: Weak");
  });
});

describe("Quick Log · early-stage slice safety", () => {
  const source = readFileSync(
    resolve(__dirname, "../lib/earlyStageQuickLogRules.ts"),
    "utf8",
  );
  it("does not introduce automation, action queue writes, or device control strings", () => {
    expect(source).not.toMatch(/action_queue|approval_required/i);
    expect(source).not.toMatch(/device[_-]?control|relay|pump|fan_on|light_on/i);
    expect(source).not.toMatch(/automation|cron|trigger|scheduler/i);
    expect(source).not.toMatch(/openai|anthropic|ai-gateway/i);
  });
});
