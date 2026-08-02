/**
 * QuickLogV2Sheet — canonical grow-scoped Timeline CTA integration.
 *
 * Every confirmed save uses the same global Timeline route, keeps the
 * server-verified grow in the URL, preserves target filters, and never
 * re-runs a writer when the grower opens the saved diary entry.
 */
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent as rtlFireEvent,
  render as rtlRender,
  screen as rtlScreen,
  waitFor as rtlWaitFor,
  within as rtlWithin,
} from "@testing-library/react";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { QUICK_LOG_TIMELINE_CTA_LABEL } from "@/lib/quickLogTimelineNavigationTarget";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
  insert: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastMessage: vi.fn(),
  navigate: vi.fn(),
  wateringWriter: vi.fn(),
  feedingWriter: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mocks.storageUpload(...args),
        remove: (...args: unknown[]) => mocks.storageRemove(...args),
      }),
    },
    from: () => ({ insert: (...args: unknown[]) => mocks.insert(...args) }),
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
    grows: [{ id: "grow-1", name: "Grow 1", stage: "veg" }],
  }),
}));
vi.mock("@/lib/writeQuickLogWateringTypedEvent", () => ({
  writeQuickLogWateringTypedEvent: (...args: unknown[]) => mocks.wateringWriter(...args),
}));
vi.mock("@/lib/writeFeedingTypedEvent", () => ({
  writeFeedingTypedEvent: (...args: unknown[]) => mocks.feedingWriter(...args),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
    message: (...args: unknown[]) => mocks.toastMessage(...args),
  },
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useInRouterContext: () => true,
    useNavigate: () => mocks.navigate,
  };
});

function renderSheet(defaultTargetKey: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onOpenChange = vi.fn();
  rtlRender(
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

function latestToastAction(): { message: string; label: string; onClick: () => void } {
  const [message, options] = mocks.toastSuccess.mock.calls.at(-1) ?? [];
  const action = (options as { action?: { label: string; onClick: () => void } })?.action;
  if (!action) throw new Error("Expected toast.success to expose a Timeline action");
  return { message: String(message), label: action.label, onClick: action.onClick };
}

function save() {
  rtlFireEvent.click(rtlScreen.getByTestId("qlv2-save"));
}

async function clickPostSaveView() {
  rtlFireEvent.click(await rtlScreen.findByTestId("quick-log-post-save-view"));
}

afterEach(() => cleanup());

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.storageRemove.mockResolvedValue({ data: null, error: null });
  mocks.insert.mockResolvedValue({ data: null, error: null });
  mocks.wateringWriter.mockResolvedValue({ ok: true, eventId: "water-event", reused: false });
  mocks.feedingWriter.mockResolvedValue({ ok: true, eventId: "feed-event", reused: false });
  (URL as unknown as { createObjectURL: (file: unknown) => string }).createObjectURL = () =>
    "blob:mock";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname: "/elsewhere", search: "", hash: "", assign: vi.fn() },
  });
});

describe("Quick Log V2 → canonical Timeline", () => {
  it("opens the exact saved plant in the verified grow and does not write again", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: "note-event", environment_event_id: null },
      error: null,
    });
    renderSheet("plant:plant-1");
    save();

    await rtlWaitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    const toastAction = latestToastAction();
    expect(toastAction.label).toBe(QUICK_LOG_TIMELINE_CTA_LABEL);
    expect(toastAction.message).toBe("Log saved");
    expect(await rtlScreen.findByTestId("quick-log-post-save-description")).toHaveTextContent(
      "Added to Grow 1.",
    );

    const writesBefore = mocks.rpc.mock.calls.length;
    await clickPostSaveView();
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-note-event",
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(writesBefore);
  });

  it("opens a tent save in the grow Timeline without inventing a hash", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: null, environment_event_id: null },
      error: null,
    });
    renderSheet("tent:tent-1");
    save();
    await rtlWaitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());

    await clickPostSaveView();
    expect(mocks.navigate).toHaveBeenCalledWith("/timeline?growId=grow-1&tentId=tent-1");
    expect(mocks.navigate.mock.calls[0][0]).not.toContain("#timeline");
  });

  it("same-page navigation scrolls to the saved entry instead of pushing again", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: "same-page-event", environment_event_id: null },
      error: null,
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/timeline",
        search: "?growId=grow-1&plantId=plant-1&tentId=tent-1",
        hash: "",
        assign: vi.fn(),
      },
    });
    const entry = document.createElement("div");
    entry.id = "timeline-entry-same-page-event";
    const scroll = vi.fn();
    entry.scrollIntoView = scroll;
    document.body.appendChild(entry);

    renderSheet("plant:plant-1");
    save();
    await rtlWaitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    await clickPostSaveView();

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("keeps structured watering on the same canonical route contract", async () => {
    renderSheet("plant:plant-1");
    rtlFireEvent.click(rtlScreen.getByRole("button", { name: "Water" }));
    const wateringForm = rtlScreen.getByTestId("qlv2-watering-form");
    rtlFireEvent.change(rtlWithin(wateringForm).getByLabelText("Volume (ml)"), {
      target: { value: "500" },
    });
    save();
    await rtlWaitFor(() => expect(mocks.wateringWriter).toHaveBeenCalledTimes(1));

    await clickPostSaveView();
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-water-event",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps structured feeding grow-scoped instead of dropping to bare Timeline", async () => {
    renderSheet("plant:plant-1");
    rtlFireEvent.click(rtlScreen.getByRole("button", { name: "Feed" }));
    const feedingForm = rtlScreen.getByTestId("qlv2-feeding-form");
    rtlFireEvent.change(rtlWithin(feedingForm).getByLabelText("Nutrient line"), {
      target: { value: "veg-line" },
    });
    rtlFireEvent.change(rtlWithin(feedingForm).getByLabelText("Product 1 name"), {
      target: { value: "Base A" },
    });
    rtlFireEvent.change(rtlWithin(feedingForm).getByLabelText("Product 1 amount"), {
      target: { value: "2" },
    });
    rtlFireEvent.change(rtlWithin(feedingForm).getByLabelText("Applied volume (ml)"), {
      target: { value: "750" },
    });
    save();
    await rtlWaitFor(() => expect(mocks.feedingWriter).toHaveBeenCalledTimes(1));

    const toastAction = latestToastAction();
    expect(toastAction.label).toBe("View diary");
    await clickPostSaveView();
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-feed-event",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps photo partial-success navigation on the saved core event", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: "photo-event", environment_event_id: null },
      error: null,
    });
    mocks.storageUpload.mockResolvedValue({ data: { path: "photo.jpg" }, error: null });
    renderSheet("plant:plant-1");

    const input = rtlScreen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    const file = new File(["image"], "plant.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [file] });
    rtlFireEvent.change(input);
    save();
    await rtlWaitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Log and photo saved", expect.anything()),
    );

    const writesBefore = mocks.rpc.mock.calls.length;
    latestToastAction().onClick();
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-photo-event",
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(writesBefore);
  });
});
