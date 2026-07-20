/**
 * Legacy QuickLog component contract tests — post-unification.
 *
 * The legacy QuickLog no longer:
 *   - uploads photos
 *   - inserts into diary_entries
 *   - embeds sensor snapshots into a persistence payload
 *
 * Supported actions (watering / observation / note) route through
 * useQuickLogV2Save → quicklog_save_manual. Unsupported actions
 * (including photo) are surfaced as "Coming soon".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import QuickLog from "./QuickLog";
import {
  PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
  serializePublicQuickLogStarterDraft,
  type PublicQuickLogStarterDraft,
} from "@/lib/publicQuickLogStarterRules";

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
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastMessage = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    message: (...a: unknown[]) => toastMessage(...a),
  },
}));

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true });
  insertMock.mockReset();
  uploadMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  toastMessage.mockReset();
  window.localStorage.clear();
});

describe("QuickLog photo attach — disabled (no upload path)", () => {
  it("renders no photo upload affordances (no file input, no image, no remove control)", () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");

    // Legacy photo upload affordances must remain gone.
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    expect(dialog.querySelector("img")).toBeNull();
    expect(within(dialog).queryByLabelText("Remove photo")).toBeNull();
  });

  it("never uploads to storage or inserts into diary_entries during save", async () => {
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={vi.fn()}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Looking good" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("QuickLog supported save · routes through quicklog_save_manual RPC", () => {
  it("refuses an ordinary crafted Water prefill before any RPC", async () => {
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={vi.fn()}
        prefill={{
          plantId: "plant-1",
          growId: "grow-1",
          tentId: "tent-1",
          eventType: "watering",
          wateringVolumeMl: 500,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("quick-log-save"));

    await waitFor(() =>
      expect(screen.getByTestId("quick-log-save-error")).toHaveTextContent(
        /structured Water form/i,
      ),
    );
    expect(saveMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      caseName: "stale revision",
      storedDraftId: "water-draft-1",
      storedUpdatedAt: "2026-07-20T12:05:00.000Z",
      storedVolumeMl: 500,
      handoffDraftId: "water-draft-1",
      handoffUpdatedAt: "2026-07-20T12:00:00.000Z",
      handoffVolumeMl: 500,
    },
    {
      caseName: "replaced draft",
      storedDraftId: "replacement-water-draft",
      storedUpdatedAt: "2026-07-20T12:00:00.000Z",
      storedVolumeMl: 500,
      handoffDraftId: "water-draft-1",
      handoffUpdatedAt: "2026-07-20T12:00:00.000Z",
      handoffVolumeMl: 500,
    },
    {
      caseName: "edited watering volume",
      storedDraftId: "water-draft-1",
      storedUpdatedAt: "2026-07-20T12:00:00.000Z",
      storedVolumeMl: 750,
      handoffDraftId: "water-draft-1",
      handoffUpdatedAt: "2026-07-20T12:00:00.000Z",
      handoffVolumeMl: 500,
    },
  ])(
    "refuses a public-starter Water handoff with a $caseName before any RPC",
    async ({
      storedDraftId,
      storedUpdatedAt,
      storedVolumeMl,
      handoffDraftId,
      handoffUpdatedAt,
      handoffVolumeMl,
    }) => {
      const storedDraft: PublicQuickLogStarterDraft = {
        v: 1,
        id: storedDraftId,
        createdAt: "2026-07-20T11:55:00.000Z",
        updatedAt: storedUpdatedAt,
        plantNickname: "Test Plant",
        stage: "veg",
        logType: "watering",
        note: "",
        wateringVolumeMl: storedVolumeMl,
        attribution: {},
      };
      const storedRaw = serializePublicQuickLogStarterDraft(storedDraft);
      window.localStorage.setItem(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY, storedRaw);

      renderWithClient(
        <QuickLog
          open={true}
          onOpenChange={vi.fn()}
          prefill={{
            plantId: "plant-1",
            growId: "grow-1",
            tentId: "tent-1",
            eventType: "watering",
            wateringVolumeMl: handoffVolumeMl,
            source: "public-starter",
            publicStarterDraftId: handoffDraftId,
            publicStarterDraftUpdatedAt: handoffUpdatedAt,
          }}
        />,
      );

      fireEvent.click(screen.getByTestId("quick-log-save"));

      await waitFor(() =>
        expect(screen.getByTestId("quick-log-save-error")).toHaveTextContent(
          /structured Water form/i,
        ),
      );
      expect(saveMock).not.toHaveBeenCalled();
      expect(insertMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY)).toBe(
        storedRaw,
      );
    },
  );

  it("keeps the narrow matching public-starter Water consume-on-success path", async () => {
    const updatedAt = new Date().toISOString();
    const draft: PublicQuickLogStarterDraft = {
      v: 1,
      id: "starter-water-1",
      createdAt: updatedAt,
      updatedAt,
      plantNickname: "Test Plant",
      stage: "veg",
      logType: "watering",
      note: "",
      wateringVolumeMl: 500,
      attribution: {},
    };
    window.localStorage.setItem(
      PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
      serializePublicQuickLogStarterDraft(draft),
    );
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={vi.fn()}
        prefill={{
          plantId: "plant-1",
          growId: "grow-1",
          tentId: "tent-1",
          eventType: "watering",
          wateringVolumeMl: 500,
          source: "public-starter",
          publicStarterDraftId: draft.id,
          publicStarterDraftUpdatedAt: draft.updatedAt,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("quick-log-save"));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0][0]).toMatchObject({
      p_action: "water",
      p_volume_ml: 500,
      p_target_id: "plant-1",
    });
    await waitFor(() =>
      expect(window.localStorage.getItem(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY)).toBeNull(),
    );
  });

  it("submits an observation with a note as p_action='note' and closes the dialog", async () => {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Topped plant" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      p_action: "note",
      p_target_type: "plant",
      p_target_id: "plant-1",
      p_note: "Topped plant",
    });
    expect(saveMock.mock.calls[0][1]).toEqual({
      telemetryIntent: "observation",
    });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();

    // Post-save behavior changed: the dialog stays open and reveals a
    // "View {plant}" target action. onOpenChange is no longer auto-fired.
    await waitFor(() =>
      expect(document.querySelector('[data-testid="quick-log-view-target-plant"]')).not.toBeNull(),
    );
    expect(onCreated).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/^(Saved|Logged) (note|observation|note for|observation for)/),
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it("blocks submit with empty note for observation, showing the validation toast", async () => {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Add a quick note"));
    expect(saveMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("surfaces RPC errors without closing the dialog", async () => {
    saveMock.mockResolvedValueOnce({ ok: false, reason: "save_failed" });
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Note" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        expect.stringMatching(/save_failed/),
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onCreated).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
