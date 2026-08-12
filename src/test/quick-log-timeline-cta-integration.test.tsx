/**
 * QuickLogV2Sheet — grow-scoped "View diary" CTA integration coverage.
 *
 * Verifies that the success toast on every Quick Log success path
 * preserves the verified save scope through the shared route helper,
 * that clicking it never re-triggers persistence, and that same-page
 * detection respects the grow query rather than only the pathname.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { QUICK_LOG_TIMELINE_CTA_LABEL } from "@/lib/quickLogTimelineNavigationTarget";

const growScope = vi.hoisted(() => ({ growId: "grow-1" as string | null }));
const rpcMock = vi.fn();
const storageUpload = vi.fn();
const storageRemove = vi.fn().mockResolvedValue({ data: null, error: null });
const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
const writeFeedingMock = vi.fn();
const writeWateringMock = vi.fn();

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
    data: [
      {
        id: "plant-1",
        name: "Plant 1",
        tent_id: "tent-1",
        grow_id: growScope.growId,
      },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: growScope.growId }],
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: growScope.growId ? [{ id: growScope.growId, name: "Home Run" }] : [],
  }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/lib/writeFeedingTypedEvent", () => ({
  writeFeedingTypedEvent: (...args: unknown[]) => writeFeedingMock(...args),
}));
vi.mock("@/lib/writeQuickLogWateringTypedEvent", () => ({
  writeQuickLogWateringTypedEvent: (...args: unknown[]) => writeWateringMock(...args),
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
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
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
function clickFeed() {
  fireEvent.click(screen.getByRole("button", { name: "Feed" }));
}
function clickWater() {
  fireEvent.click(screen.getByRole("button", { name: "Water" }));
}
function fillRequiredFeedingFields() {
  fireEvent.change(screen.getByLabelText("Nutrient line"), {
    target: { value: "veg-week-3" },
  });
  fireEvent.change(screen.getByLabelText("Product 1 name"), {
    target: { value: "Base A" },
  });
  fireEvent.change(screen.getByLabelText("Product 1 amount"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("Applied volume (ml)"), {
    target: { value: "750" },
  });
}
function fillRequiredWateringFields() {
  fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "500" } });
}
function clickSave() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

beforeEach(() => {
  growScope.growId = "grow-1";
  rpcMock.mockReset();
  writeFeedingMock.mockReset();
  writeWateringMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  navigateMock.mockReset();
  useNavigateMock.mockClear();
  storageUpload.mockReset();
  storageRemove.mockReset();
  storageRemove.mockResolvedValue({ data: null, error: null });
  insertMock.mockReset();
  insertMock.mockResolvedValue({ data: null, error: null });
  document.body.innerHTML = "";
  // jsdom doesn't implement URL.createObjectURL; stub for photo preview.
  (URL as unknown as { createObjectURL: (f: unknown) => string }).createObjectURL = () =>
    "blob:mock";
  // Default to a non-matching pathname so default behavior is cross-page.
  Object.defineProperty(window, "location", {
    writable: true,
    value: { pathname: "/elsewhere", search: "", hash: "", assign: vi.fn() },
  });
});

describe("Quick Log → Timeline CTA (standard save)", () => {
  it("opens the saved plant entry in its grow-scoped global Timeline without another RPC", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "ge-42", environment_event_id: null },
      error: null,
    });
    const { onOpenChange } = renderSheet("plant:plant-1");
    clickNote();
    clickSave();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    const action = getToastAction();
    expect(action.label).toBe(QUICK_LOG_TIMELINE_CTA_LABEL);
    expect(action.message).toBe("Log saved");
    expect(screen.getByTestId("quick-log-post-save-title")).toHaveTextContent(
      "Saved to your diary",
    );
    expect(screen.getByTestId("quick-log-post-save-description")).toHaveTextContent(
      "Added to Home Run.",
    );

    const rpcBefore = rpcMock.mock.calls.length;
    fireEvent.click(screen.getByTestId("quick-log-post-save-view"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigateMock).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-ge-42",
    );
    // A diary CTA is navigation only; it cannot create a second save.
    expect(rpcMock.mock.calls.length).toBe(rpcBefore);
  });

  it("keeps a tent save grow-scoped without inventing a fake anchor", async () => {
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
    expect(navigateMock.mock.calls[0][0]).not.toContain("#timeline");
  });

  it("same-query Timeline click smooth-scrolls to the entry without navigating", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "ge-7", environment_event_id: null },
      error: null,
    });
    Object.defineProperty(window, "location", {
      writable: true,
      value: {
        pathname: "/timeline",
        search: "?growId=grow-1&plantId=plant-1&tentId=tent-1",
        hash: "",
        assign: vi.fn(),
      },
    });

    const el = document.createElement("div");
    el.id = "timeline-entry-ge-7";
    const scrollSpy = vi.fn();
    (el as unknown as { scrollIntoView: typeof scrollSpy }).scrollIntoView = scrollSpy;
    document.body.appendChild(el);

    renderSheet("plant:plant-1");
    clickNote();
    clickSave();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    const rpcBefore = rpcMock.mock.calls.length;
    getToastAction().onClick();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
    expect(rpcMock.mock.calls.length).toBe(rpcBefore);
  });

  it("treats a different Timeline grow query as cross-page navigation", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "ge-other-grow", environment_event_id: null },
      error: null,
    });
    Object.defineProperty(window, "location", {
      writable: true,
      value: {
        pathname: "/timeline",
        search: "?growId=different-grow&plantId=plant-1&tentId=tent-1",
        hash: "",
        assign: vi.fn(),
      },
    });

    renderSheet("plant:plant-1");
    clickNote();
    clickSave();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    getToastAction().onClick();
    expect(navigateMock).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-ge-other-grow",
    );
  });
});

describe("Quick Log → Timeline CTA (photo success)", () => {
  it("'Log and photo saved' exposes the same CTA", async () => {
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

describe("Quick Log → Timeline CTA (typed root-zone saves)", () => {
  it("keeps Feed target context and never emits an unscoped Timeline route", async () => {
    writeFeedingMock.mockResolvedValue({ ok: true, eventId: "feed-event-1", reused: false });
    renderSheet("plant:plant-1");
    clickFeed();
    fillRequiredFeedingFields();
    clickSave();

    await waitFor(() => expect(writeFeedingMock).toHaveBeenCalledTimes(1));
    const action = getToastAction();
    const writesBefore = writeFeedingMock.mock.calls.length;
    action.onClick();

    expect(navigateMock).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-feed-event-1",
    );
    expect(navigateMock.mock.calls[0][0]).toContain("growId=grow-1");
    expect(navigateMock.mock.calls[0][0]).not.toBe("/timeline");
    expect(writeFeedingMock).toHaveBeenCalledTimes(writesBefore);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("uses the same grow-scoped route for Water without a duplicate write", async () => {
    writeWateringMock.mockResolvedValue({ ok: true, eventId: "water-event-1", reused: false });
    renderSheet("plant:plant-1");
    clickWater();
    fillRequiredWateringFields();
    clickSave();

    await waitFor(() => expect(writeWateringMock).toHaveBeenCalledTimes(1));
    const action = getToastAction();
    const writesBefore = writeWateringMock.mock.calls.length;
    action.onClick();

    expect(navigateMock).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-water-event-1",
    );
    expect(writeWateringMock).toHaveBeenCalledTimes(writesBefore);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("Quick Log → Timeline CTA (missing grow context)", () => {
  it("keeps the save confirmation but fails closed without an actionable diary route", async () => {
    growScope.growId = null;
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "ge-no-grow", environment_event_id: null },
      error: null,
    });
    const { onOpenChange } = renderSheet("plant:plant-1");
    clickNote();
    clickSave();

    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeInTheDocument());
    expect(toastSuccess).toHaveBeenCalledWith("Log saved");
    expect(screen.getByTestId("quick-log-post-save-view")).toBeDisabled();
    expect(screen.getByTestId("quick-log-post-save-view")).toHaveAccessibleDescription(
      "Diary view is unavailable because the saved setup could not be verified.",
    );

    fireEvent.click(screen.getByTestId("quick-log-post-save-view"));
    expect(navigateMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
