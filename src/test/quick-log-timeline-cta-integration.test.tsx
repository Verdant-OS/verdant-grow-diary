/**
 * QuickLogV2Sheet — "View diary" CTA integration coverage.
 *
 * Verifies that the success toast on every Quick Log success path
 * exposes the exact CTA label, that clicking it navigates to the
 * grow-scoped global Timeline (not Plant/Tent Detail), that feed
 * retains the verified grow, and that the CTA never re-triggers save.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { QUICK_LOG_TIMELINE_CTA_LABEL } from "@/lib/quickLogTimelineNavigationTarget";

const rpcMock = vi.fn();
const storageUpload = vi.fn();
const storageRemove = vi.fn().mockResolvedValue({ data: null, error: null });
const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    storage: {
      from: () => ({ upload: storageUpload, remove: storageRemove }),
    },
    from: () => ({ insert: insertMock }),
  },
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Grow One", stage: "veg" }],
    activeGrow: { id: "grow-1", name: "Grow One", stage: "veg" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

const navigateMock = vi.fn();
const useNavigateMock = vi.fn(() => navigateMock);
vi.mock("@/lib/react-router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/react-router-compat")>("@/lib/react-router-compat");
  return {
    ...actual,
    useInRouterContext: () => true,
    useNavigate: () => useNavigateMock(),
  };
});

function renderSheet(defaultTargetKey: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={true}
        onOpenChange={onOpenChange}
        defaultTargetKey={defaultTargetKey}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

function getToastAction(): {
  message: string;
  label: string;
  onClick: () => void;
} {
  const [message, opts] = toastSuccess.mock.calls.at(-1) ?? [];
  const action = (opts as { action?: { label: string; onClick: () => void } })?.action;
  if (!action) throw new Error("toast.success called without action");
  return { message: String(message), label: action.label, onClick: action.onClick };
}

function clickNote() {
  fireEvent.click(screen.getByRole("button", { name: "Note" }));
}
function clickSave() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

beforeEach(() => {
  rpcMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  navigateMock.mockReset();
  useNavigateMock.mockClear();
  storageUpload.mockReset();
  storageRemove.mockClear();
  insertMock.mockClear();
  document.body.innerHTML = "";
  // jsdom doesn't implement URL.createObjectURL; stub for photo preview.
  (URL as unknown as { createObjectURL: (f: unknown) => string }).createObjectURL = () =>
    "blob:mock";
  // Default to a non-matching pathname so default behavior is cross-page.
  Object.defineProperty(window, "location", {
    writable: true,
    value: { pathname: "/elsewhere", hash: "", assign: vi.fn() },
  });
});

describe("Quick Log → Timeline CTA (standard save)", () => {
  it("exposes 'View diary' with grow-scoped Timeline href (not Plant Detail)", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "ge-42", environment_event_id: null },
      error: null,
    });
    renderSheet("plant:plant-1");
    clickNote();
    clickSave();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    const action = getToastAction();
    expect(action.label).toBe(QUICK_LOG_TIMELINE_CTA_LABEL);
    expect(action.message).toBe("Log saved");

    const rpcBefore = rpcMock.mock.calls.length;
    action.onClick();
    expect(navigateMock).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-ge-42",
    );
    // Must not route to Plant Detail.
    expect(navigateMock.mock.calls[0][0]).not.toMatch(/^\/plants\//);
    // CTA must not trigger any extra RPC / save.
    expect(rpcMock.mock.calls.length).toBe(rpcBefore);
  });

  it("tent target routes to grow-scoped Timeline without plantId", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: null, environment_event_id: null },
      error: null,
    });
    renderSheet("tent:tent-1");
    clickNote();
    clickSave();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    const action = getToastAction();
    action.onClick();
    expect(navigateMock).toHaveBeenCalledWith("/timeline?growId=grow-1&tentId=tent-1");
    expect(navigateMock.mock.calls[0][0]).not.toMatch(/^\/tents\//);
    expect(navigateMock.mock.calls[0][0]).not.toContain("#");
  });

  it("post-save panel View diary CTA uses the same grow-scoped route", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "ge-panel", environment_event_id: null },
      error: null,
    });
    renderSheet("plant:plant-1");
    clickNote();
    clickSave();
    await waitFor(() => screen.getByTestId("qlv2-post-save"));

    const viewBtn = screen.getByTestId("quick-log-post-save-view");
    expect(viewBtn).not.toBeDisabled();
    expect(viewBtn.textContent).toMatch(/View diary/i);

    const rpcBefore = rpcMock.mock.calls.length;
    fireEvent.click(viewBtn);
    expect(navigateMock).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-ge-panel",
    );
    expect(rpcMock.mock.calls.length).toBe(rpcBefore);
  });
});

describe("Quick Log → Timeline CTA (photo success)", () => {
  it("'Log and photo saved' exposes the same grow-scoped CTA", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "ge-photo", environment_event_id: null },
      error: null,
    });
    storageUpload.mockResolvedValue({ data: { path: "p" }, error: null });

    renderSheet("plant:plant-1");
    clickNote();

    // Inject a photo file through the hidden library input.
    const libInput = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    const file = new File(["x"], "x.jpg", { type: "image/jpeg" });
    Object.defineProperty(libInput, "files", { value: [file] });
    fireEvent.change(libInput);

    clickSave();
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Log and photo saved", expect.anything()),
    );

    const action = getToastAction();
    expect(action.label).toBe(QUICK_LOG_TIMELINE_CTA_LABEL);

    const rpcBefore = rpcMock.mock.calls.length;
    action.onClick();
    expect(navigateMock).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-ge-photo",
    );
    expect(rpcMock.mock.calls.length).toBe(rpcBefore);
  });
});
