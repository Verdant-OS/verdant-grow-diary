import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlantQuickLog from "@/components/PlantQuickLog";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

const rpcMock = vi.fn();
const storageUploadMock = vi.fn();
const storageRemoveMock = vi.fn();
const diaryInsertMock = vi.fn();
const writeFeedingMock = vi.fn();
const win = window as unknown as { gtag?: (...args: unknown[]) => void };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => storageUploadMock(...args),
        remove: (...args: unknown[]) => storageRemoveMock(...args),
      }),
    },
    from: () => ({
      insert: (...args: unknown[]) => diaryInsertMock(...args),
    }),
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

vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorLogs: () => ({ data: [] }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/writeFeedingTypedEvent", () => ({
  writeFeedingTypedEvent: (...args: unknown[]) => writeFeedingMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function gtagMock() {
  return win.gtag as ReturnType<typeof vi.fn>;
}

function renderFeedSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

function fillFeedForm() {
  fireEvent.click(screen.getByRole("button", { name: "Feed" }));
  fireEvent.change(screen.getByLabelText("Nutrient line"), {
    target: { value: "veg-week-3" },
  });
  fireEvent.change(screen.getByLabelText("Product 1 name"), {
    target: { value: "Base A" },
  });
  fireEvent.change(screen.getByLabelText("Product 1 amount"), {
    target: { value: "2" },
  });
}

function renderPlantQuickLog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PlantQuickLog
        open
        onOpenChange={vi.fn()}
        plantId="plant-1"
        plantName="Plant 1"
        growId="grow-1"
        tentId="tent-1"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpcMock.mockReset();
  storageUploadMock.mockReset();
  storageRemoveMock.mockReset();
  diaryInsertMock.mockReset();
  writeFeedingMock.mockReset();
  storageUploadMock.mockResolvedValue({ data: { path: "saved.jpg" }, error: null });
  storageRemoveMock.mockResolvedValue({ data: null, error: null });
  win.gtag = vi.fn();

  if (typeof URL.createObjectURL !== "function") {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:quick-log-photo"),
    });
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:quick-log-photo");
  }
  if (typeof URL.revokeObjectURL !== "function") {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  } else {
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  }
});

afterEach(() => {
  delete win.gtag;
  vi.restoreAllMocks();
});

describe("structured-feed Quick Log success telemetry", () => {
  it("emits exactly once and only after the feeding write confirms success", async () => {
    const write = deferred<{ ok: true; eventId: string }>();
    writeFeedingMock.mockReturnValueOnce(write.promise);
    renderFeedSheet();
    fillFeedForm();

    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(writeFeedingMock).toHaveBeenCalledTimes(1));
    expect(gtagMock()).not.toHaveBeenCalled();

    await act(async () => {
      write.resolve({ ok: true, eventId: "feeding-1" });
      await write.promise;
    });

    await waitFor(() => expect(gtagMock()).toHaveBeenCalledTimes(1));
    expect(gtagMock()).toHaveBeenCalledWith("event", "quick_log_saved", {
      event_type: "feed",
    });
  });

  it("emits zero events when the feeding writer rejects persistence", async () => {
    writeFeedingMock.mockResolvedValueOnce({ ok: false, reason: "rpc:error" });
    renderFeedSheet();
    fillFeedForm();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(writeFeedingMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("qlv2-error")).toBeInTheDocument());
    expect(gtagMock()).not.toHaveBeenCalled();
  });
});

describe("PlantQuickLog success telemetry", () => {
  it("emits exactly once and only after the diary insert confirms success", async () => {
    const insert = deferred<{ data: null; error: null }>();
    diaryInsertMock.mockReturnValueOnce(insert.promise);
    renderPlantQuickLog();
    fireEvent.click(screen.getByRole("button", { name: /log action watered/i }));
    fireEvent.click(screen.getByRole("button", { name: /save quick log/i }));

    await waitFor(() => expect(diaryInsertMock).toHaveBeenCalledTimes(1));
    expect(gtagMock()).not.toHaveBeenCalled();

    await act(async () => {
      insert.resolve({ data: null, error: null });
      await insert.promise;
    });

    await waitFor(() => expect(gtagMock()).toHaveBeenCalledTimes(1));
    expect(gtagMock()).toHaveBeenCalledWith("event", "quick_log_saved", {
      event_type: "plant_check",
    });
  });

  it("emits zero events when the diary insert is rejected", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    diaryInsertMock.mockResolvedValueOnce({
      data: null,
      error: { message: "insert rejected" },
    });
    renderPlantQuickLog();
    fireEvent.click(screen.getByRole("button", { name: /log action watered/i }));
    fireEvent.click(screen.getByRole("button", { name: /save quick log/i }));

    await waitFor(() => expect(diaryInsertMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("plant-quick-log-error")).toHaveTextContent(/could not save/i),
    );
    expect(gtagMock()).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("does not count a successful attachment upload when the diary insert fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    diaryInsertMock.mockResolvedValueOnce({
      data: null,
      error: { message: "insert rejected" },
    });
    renderPlantQuickLog();
    const file = new File([new Uint8Array([1, 2, 3])], "plant.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(document.getElementById("plant-quick-log-photo-input")!, {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /save quick log/i }));

    await waitFor(() => expect(storageUploadMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(diaryInsertMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("plant-quick-log-error")).toHaveTextContent(/could not save/i),
    );
    expect(gtagMock()).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
