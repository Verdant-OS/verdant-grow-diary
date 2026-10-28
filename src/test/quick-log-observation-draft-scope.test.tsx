import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    loading: false,
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-1", name: "QA Test", tent_id: "tent-1", grow_id: "grow-1" },
      { id: "plant-2", name: "QA Two", tent_id: "tent-1", grow_id: "grow-1" },
    ],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "QA Test", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "QA Test", is_archived: false }] }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import {
  QUICK_LOG_OBSERVATION_DRAFT_RESTORED_COPY,
  QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY,
  QUICK_LOG_OBSERVATION_SAVE_ERROR,
} from "@/lib/quickLogObservationDraftRules";

function renderSheet(target: string | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={() => {}} defaultTargetKey={target} />
    </QueryClientProvider>,
  );
}

async function failNoteOn(target: string, reason: string) {
  rpcMock.mockResolvedValue({ data: { ok: false, reason }, error: null });
  renderSheet(target);
  const note = await screen.findByTestId("qlv2-note");
  fireEvent.change(note, { target: { value: "First leaves look pale" } });
  fireEvent.click(screen.getByTestId("qlv2-save"));
  await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(window.sessionStorage.length).toBeGreaterThan(0));
  cleanup();
}

describe("Quick Log observation draft scope and ambiguous outcomes (#2541 P2s)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    rpcMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("does not restore plant A's draft when the sheet opens for plant B", async () => {
    await failNoteOn("plant:plant-1", "invalid_details");
    renderSheet("plant:plant-2");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("");
    expect(screen.queryByTestId("qlv2-draft-restored")).toBeNull();
  });

  it("restores the draft for the same target and says so", async () => {
    await failNoteOn("plant:plant-1", "invalid_details");
    renderSheet("plant:plant-1");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("First leaves look pale");
    expect(screen.getByTestId("qlv2-draft-restored")).toHaveTextContent(
      QUICK_LOG_OBSERVATION_DRAFT_RESTORED_COPY,
    );
  });

  it("restores the words but not the target when the sheet opens with none", async () => {
    await failNoteOn("plant:plant-1", "invalid_details");
    renderSheet(null);
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("First leaves look pale");
    expect(screen.getByTestId("qlv2-draft-restored")).toHaveTextContent(
      QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY,
    );
    // The grower picks the target; the draft never does.
    expect(screen.getByLabelText("Choose plant or tent for this Quick Log")).toHaveTextContent(
      "Choose a tent or plant",
    );
    // The old target's failed save does not follow the words.
    expect(screen.queryByText(QUICK_LOG_OBSERVATION_SAVE_ERROR)).toBeNull();
  });

  it("forgets a draft the grower deleted back to empty (review 5677784998)", async () => {
    renderSheet("plant:plant-1");
    const note = await screen.findByTestId("qlv2-note");
    fireEvent.change(note, { target: { value: "abc" } });
    await waitFor(() => expect(window.sessionStorage.length).toBeGreaterThan(0));
    fireEvent.change(note, { target: { value: "" } });
    cleanup();
    renderSheet("plant:plant-1");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("");
    expect(screen.queryByTestId("qlv2-draft-restored")).toBeNull();
  });

  it("keeps plant A's draft when the sheet opens for plant B and nothing is typed", async () => {
    await failNoteOn("plant:plant-1", "invalid_details");
    renderSheet("plant:plant-2");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("");
    cleanup();
    renderSheet("plant:plant-1");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("First leaves look pale");
  });

  it("pins: an ambiguous outcome keeps its key through a reload (durable recovery owns it)", async () => {
    await failNoteOn("plant:plant-1", "receipt_unverified");
    const firstKey = rpcMock.mock.calls[0]?.[1]?.p_idempotency_key;
    expect(firstKey).toBeTruthy();
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "evt-1", environment_event_id: null, reused: true },
      error: null,
    });
    renderSheet("plant:plant-1");
    expect(await screen.findByTestId("qlv2-note")).toHaveValue("First leaves look pale");
    // An ambiguous outcome is never reported as a definitive "could not save".
    expect(screen.queryByText(QUICK_LOG_OBSERVATION_SAVE_ERROR)).toBeNull();
    const save = screen.queryByTestId("qlv2-save-retry") ?? screen.getByTestId("qlv2-save");
    fireEvent.click(save);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(rpcMock.mock.calls[1]?.[1]?.p_idempotency_key).toBe(firstKey);
  });
});
