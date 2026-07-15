/**
 * Quick Log × public starter handoff — explicit-save-only consume contract.
 *
 * The public starter draft may be cleared in EXACTLY one place: the Quick
 * Log dialog's success path, after quicklog_save_manual confirmed the
 * write, and only when the stored draft is still the one the grower
 * reviewed (id match). This file pins:
 *  - explicit save writes exactly once (double-click cannot double-write),
 *  - success clears the draft; failure and exceptions retain it,
 *  - opening/rendering/remounting with a prefill never writes and never
 *    clears,
 *  - a stale marker (draft replaced in another tab) never clears the new
 *    draft; absent marker never clears anything,
 *  - the starter watering volume seeds the form only-if-empty and lands in
 *    the RPC payload the grower confirmed.
 *
 * Harness mirrors src/components/QuickLog.test.tsx (mocked save hook +
 * supabase client + auth/grows/plants), with the REAL draft store running
 * against test localStorage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const saveMock = vi.fn();
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: (...a: unknown[]) => saveMock(...a),
    saving: false,
    error: null,
  }),
}));

const insertMock = vi.fn();
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

import QuickLog, { type QuickLogPrefill } from "@/components/QuickLog";
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

function starterDraft(
  overrides: Partial<PublicQuickLogStarterDraft> = {},
): PublicQuickLogStarterDraft {
  return {
    v: 1,
    id: "draft-1",
    createdAt: "2026-07-15T10:00:00.000Z",
    updatedAt: "2026-07-15T10:00:00.000Z",
    plantNickname: "Test Plant",
    stage: "",
    logType: "observation",
    note: "First true leaves look healthy.",
    wateringVolumeMl: null,
    attribution: {},
    ...overrides,
  };
}

function seedDraft(d: PublicQuickLogStarterDraft = starterDraft()) {
  setLocalStorageItemForTest(
    PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
    serializePublicQuickLogStarterDraft(d),
  );
}

function storedDraftRaw(): string | null {
  return getLocalStorageItemForTest(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY);
}

function handoffPrefill(overrides: Partial<QuickLogPrefill> = {}): QuickLogPrefill {
  return {
    plantId: "plant-1",
    plantName: "Test Plant",
    growId: "grow-1",
    tentId: "tent-1",
    eventType: "observation",
    note: "First true leaves look healthy.",
    wateringVolumeMl: null,
    suggestSnapshot: false,
    source: "public-starter",
    publicStarterDraftId: "draft-1",
    publicStarterDraftUpdatedAt: "2026-07-15T10:00:00.000Z",
    ...overrides,
  };
}

function saveButton() {
  return screen.getByTestId("quick-log-save");
}

describe("Quick Log starter-handoff consume-once", () => {
  beforeEach(() => {
    clearLocalStorageForTest();
    saveMock.mockReset();
    saveMock.mockResolvedValue({ ok: true });
    insertMock.mockReset();
  });

  it("rendering the prefilled dialog performs ZERO writes and never clears the draft", () => {
    seedDraft();
    const before = storedDraftRaw();
    const view = renderWithClient(
      <QuickLog open onOpenChange={vi.fn()} prefill={handoffPrefill()} />,
    );
    expect(saveMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(storedDraftRaw()).toBe(before);
    // Remount (route change / refresh analogue): still zero writes.
    view.unmount();
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={handoffPrefill()} />);
    expect(saveMock).not.toHaveBeenCalled();
    expect(storedDraftRaw()).toBe(before);
  });

  it("explicit save writes exactly once and clears the reviewed draft only after success", async () => {
    seedDraft();
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={handoffPrefill()} />);
    expect(storedDraftRaw()).not.toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(storedDraftRaw()).toBeNull());
  });

  it("a double-click cannot produce two entries", async () => {
    seedDraft();
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={handoffPrefill()} />);
    const btn = saveButton();
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    // Post-save state disables further submissions entirely.
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-post-save")).toBeInTheDocument(),
    );
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("a FAILED write retains the draft and shows the recoverable error", async () => {
    saveMock.mockResolvedValue({ ok: false, reason: "tent_not_found" });
    seedDraft();
    const before = storedDraftRaw();
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={handoffPrefill()} />);
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-save-error")).toBeInTheDocument(),
    );
    expect(storedDraftRaw()).toBe(before);
    expect(screen.queryByTestId("quick-log-post-save")).toBeNull();
  });

  it("an RPC exception retains the draft", async () => {
    saveMock.mockRejectedValue(new Error("network down"));
    seedDraft();
    const before = storedDraftRaw();
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={handoffPrefill()} />);
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(storedDraftRaw()).toBe(before);
  });

  it("never clears a draft EDITED after review (same id, newer revision)", async () => {
    // Draft ids survive edits; the marker also carries the reviewed
    // updatedAt, so an edit made in another tab mid-review is preserved.
    seedDraft(starterDraft({ updatedAt: "2026-07-15T11:30:00.000Z" }));
    const before = storedDraftRaw();
    renderWithClient(
      <QuickLog
        open
        onOpenChange={vi.fn()}
        prefill={handoffPrefill({
          publicStarterDraftUpdatedAt: "2026-07-15T10:00:00.000Z",
        })}
      />,
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-post-save")).toBeInTheDocument(),
    );
    expect(storedDraftRaw()).toBe(before);
  });

  it("retries reuse ONE idempotency key; a new logical submission rotates it", async () => {
    // quickLogIdempotencyKey contract: a lost-response retry must dedupe
    // server-side, so the key may only rotate after success/"Log another".
    saveMock.mockResolvedValueOnce({ ok: false, reason: "tent_not_found" });
    seedDraft();
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={handoffPrefill()} />);
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-save-error")).toBeInTheDocument(),
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    const key1 = (saveMock.mock.calls[0][0] as Record<string, unknown>).p_idempotency_key;
    const key2 = (saveMock.mock.calls[1][0] as Record<string, unknown>).p_idempotency_key;
    expect(typeof key1).toBe("string");
    expect(key2, "retry must reuse the same idempotency key").toBe(key1);

    // Success happened on the retry; "Log another" starts a new submission.
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-post-save")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("quick-log-post-save-another"));
    fireEvent.change(screen.getByTestId("quicklog-note"), {
      target: { value: "another note" },
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(3));
    const key3 = (saveMock.mock.calls[2][0] as Record<string, unknown>).p_idempotency_key;
    expect(key3, "a new logical submission mints a fresh key").not.toBe(key1);
  });

  it("closing the dialog abandons the submission: the key rotates so a later log is never deduped away", async () => {
    // Failed save (key kept for in-place retry) → grower CLOSES instead →
    // a brand-new log must carry a NEW key, or the RPC would return the
    // abandoned entry as a duplicate and silently skip the new content.
    saveMock.mockResolvedValueOnce({ ok: false, reason: "tent_not_found" });
    seedDraft();
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={handoffPrefill()} />);
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-save-error")).toBeInTheDocument(),
    );
    const key1 = (saveMock.mock.calls[0][0] as Record<string, unknown>).p_idempotency_key;

    // Close (Escape) — the dialog wrapper runs reset(), abandoning the
    // submission. The harness keeps `open` true, so the form stays mounted.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    fireEvent.change(screen.getByTestId("quicklog-note"), {
      target: { value: "a different, later note" },
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    const key2 = (saveMock.mock.calls[1][0] as Record<string, unknown>).p_idempotency_key;
    expect(key2, "a post-close submission must mint a fresh key").not.toBe(key1);
  });

  it("a prefilled plant outside the current scope is never displaced by stale defaults", async () => {
    // Cross-grow handoff: the matched plant belongs to a grow that is not
    // active yet (setActiveGrowId still propagating). The dialog must NOT
    // grab the old grow's last-target/only-plant while it waits — the
    // wrong-plant selection would be one click from a mis-attributed save.
    seedDraft();
    setLocalStorageItemForTest(
      "verdant.quickLog.lastTarget.v1",
      JSON.stringify({
        plantId: "plant-1",
        growId: "grow-1",
        tentId: "tent-1",
        savedAt: "2026-07-15T09:00:00.000Z",
      }),
    );
    const before = storedDraftRaw();
    renderWithClient(
      <QuickLog
        open
        onOpenChange={vi.fn()}
        prefill={handoffPrefill({
          plantId: "99999999-9999-4999-8999-999999999999",
          growId: "grow-2",
          tentId: "tent-2",
        })}
      />,
    );
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-plant-error")).toBeInTheDocument(),
    );
    expect(saveMock).not.toHaveBeenCalled();
    expect(storedDraftRaw()).toBe(before);
  });

  it("never clears a DIFFERENT draft (replaced in another tab after review)", async () => {
    seedDraft(starterDraft({ id: "draft-2-newer" }));
    const before = storedDraftRaw();
    renderWithClient(
      <QuickLog
        open
        onOpenChange={vi.fn()}
        prefill={handoffPrefill({ publicStarterDraftId: "draft-1" })}
      />,
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-post-save")).toBeInTheDocument(),
    );
    expect(storedDraftRaw()).toBe(before);
  });

  it("without the starter marker, ordinary saves never touch the draft", async () => {
    seedDraft();
    const before = storedDraftRaw();
    renderWithClient(
      <QuickLog
        open
        onOpenChange={vi.fn()}
        prefill={handoffPrefill({ publicStarterDraftId: null })}
      />,
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-post-save")).toBeInTheDocument(),
    );
    expect(storedDraftRaw()).toBe(before);
  });

  it("ambiguous handoff (suppressPlantDefault) never auto-picks: not last-target, not the only scoped plant", async () => {
    // A remembered last target AND a single plant in the active grow are
    // both present — the two fallbacks pickDefaultQuickLogPlant would
    // normally use. The ambiguous handoff must leave the choice empty and
    // refuse to write until the grower picks.
    seedDraft();
    setLocalStorageItemForTest(
      "verdant.quickLog.lastTarget.v1",
      JSON.stringify({
        plantId: "plant-1",
        growId: "grow-1",
        tentId: "tent-1",
        savedAt: "2026-07-15T09:00:00.000Z",
      }),
    );
    const before = storedDraftRaw();
    renderWithClient(
      <QuickLog
        open
        onOpenChange={vi.fn()}
        prefill={handoffPrefill({
          plantId: null,
          plantName: null,
          growId: null,
          tentId: null,
          suppressPlantDefault: true,
        })}
      />,
    );
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-plant-error")).toBeInTheDocument(),
    );
    expect(saveMock).not.toHaveBeenCalled();
    expect(storedDraftRaw()).toBe(before);
  });

  it("seeds the starter watering volume only-if-empty and the grower-confirmed payload carries it", async () => {
    seedDraft(
      starterDraft({ id: "draft-w", logType: "watering", note: "", wateringVolumeMl: 500 }),
    );
    renderWithClient(
      <QuickLog
        open
        onOpenChange={vi.fn()}
        prefill={handoffPrefill({
          eventType: "watering",
          note: null,
          wateringVolumeMl: 500,
          publicStarterDraftId: "draft-w",
        })}
      />,
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.p_action).toBe("water");
    expect(payload.p_volume_ml).toBe(500);
    await waitFor(() => expect(storedDraftRaw()).toBeNull());
  });
});
