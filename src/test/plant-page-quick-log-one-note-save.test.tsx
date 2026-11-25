/**
 * One visible note is the note that saves, one Save tap writes once, and a
 * failed save leaves the shared V2 observation draft for the next mount.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearLocalStorageForTest } from "@/test/helpers/localStorageTestHelper";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { QUICK_LOG_OBSERVATION_DRAFT_FORM_ID } from "@/lib/quickLogObservationDraftRules";
import { sessionFormDraftStorageKey } from "@/lib/sessionFormDraftRules";

const USER_ID = "user-1";
const NOTE = "QA-SYNTH pale top growth";
const rpcMock = vi.fn();

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open
        onOpenChange={vi.fn()}
        defaultTargetKey="plant:plant-1"
        defaultAction="note"
      />
    </QueryClientProvider>,
  );
}

function noteBox(): HTMLTextAreaElement {
  return screen.getByLabelText("Note (optional)") as HTMLTextAreaElement;
}

beforeEach(() => {
  clearLocalStorageForTest();
  window.sessionStorage.clear();
  rpcMock.mockReset();
});
afterEach(() => cleanup());

describe("shared Quick Log V2 note", () => {
  it("saves exactly the note that is shown", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001" },
      error: null,
    });
    renderSheet();
    fireEvent.change(noteBox(), { target: { value: NOTE } });
    expect(noteBox().value).toBe(NOTE);
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [fn, payload] = rpcMock.mock.calls[0] as [string, { p_note: string }];
    expect(fn).toBe("quicklog_save_manual");
    expect(payload.p_note).toBe(NOTE);
  });

  it("one Save tap creates one save when the button is pressed twice", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000002" },
      error: null,
    });
    renderSheet();
    fireEvent.change(noteBox(), { target: { value: NOTE } });
    const save = screen.getByTestId("qlv2-save");
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the same draft after a failed save and on the next mount", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "save failed" } });
    const first = renderSheet();
    fireEvent.change(noteBox(), { target: { value: NOTE } });
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(noteBox().value).toBe(NOTE);

    const draftKey = sessionFormDraftStorageKey(USER_ID, QUICK_LOG_OBSERVATION_DRAFT_FORM_ID);
    expect(draftKey).toBe(`verdant.session-form.1.${USER_ID}.quick-log-v2-observation`);
    const stored = window.sessionStorage.getItem(draftKey);
    expect(stored).toContain(NOTE);
    const pending = window.sessionStorage.getItem(`verdant:quick-log:pending-note:v1:${USER_ID}`);
    expect(pending).toContain(NOTE);

    first.unmount();
    renderSheet();
    expect(noteBox().value).toBe(NOTE);
  });
});
