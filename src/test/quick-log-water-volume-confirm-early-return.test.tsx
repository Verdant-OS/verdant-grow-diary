/**
 * Confirm arms a one-shot save. If handleSave returns before the save starts,
 * that arm must not block the next Confirm.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpcMock = vi.fn();
const videoValidationMock = vi.fn();
const wateringWriterMock = vi.fn();
const pngGate = vi.hoisted(() => ({
  pending: [] as Array<(result: { ok: true } | { ok: false; message: string }) => void>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: {
      from: () => ({
        upload: async (path: string) => ({ data: { path }, error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
  },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "QA Test",
        tent_id: "55555555-5555-4555-8555-555555555555",
        grow_id: "66666666-6666-4666-8666-666666666666",
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "QA Test",
        grow_id: "66666666-6666-4666-8666-666666666666",
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "66666666-6666-4666-8666-666666666666", name: "QA Test" }],
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/lib/writeQuickLogWateringTypedEvent", () => ({
  writeQuickLogWateringTypedEvent: (...args: unknown[]) => wateringWriterMock(...args),
}));
vi.mock("@/lib/videoAttachmentRules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/videoAttachmentRules")>(
    "@/lib/videoAttachmentRules",
  );
  return {
    ...actual,
    createBrowserVideoDurationProber: () => () => Promise.resolve(1),
    validateVideoAttachment: (...args: unknown[]) => videoValidationMock(...args),
  };
});

vi.mock("@/lib/quickLogPhotoContentRules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/quickLogPhotoContentRules")>(
    "@/lib/quickLogPhotoContentRules",
  );
  return {
    ...actual,
    validateQuickLogPngClaim: (file: { name?: string | null; type?: string | null }) => {
      if (!actual.fileClaimsPng(file)) return Promise.resolve({ ok: true as const });
      return new Promise((resolve) => {
        pngGate.pending.push(resolve);
      });
    },
  };
});

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open
        onOpenChange={() => {}}
        defaultTargetKey="plant:33333333-3333-4333-8333-333333333333"
      />
    </QueryClientProvider>,
  );
}

function enterLargeWater() {
  fireEvent.click(screen.getByRole("button", { name: "Water" }));
  fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "10001" } });
}

beforeEach(() => {
  window.sessionStorage.clear();
  let tail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(window.navigator, "locks", {
    configurable: true,
    value: {
      request: (_name: string, _options: unknown, callback: () => unknown) => {
        const turn = tail.then(callback);
        tail = turn.then(
          () => undefined,
          () => undefined,
        );
        return turn;
      },
    },
  });
  pngGate.pending.length = 0;
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: "event-1" }, error: null });
  wateringWriterMock.mockReset();
  wateringWriterMock.mockResolvedValue({ ok: true, eventId: "water-event-1", reused: false });
  videoValidationMock.mockReset();
  videoValidationMock.mockResolvedValue({
    ok: true,
    mime: "video/mp4",
    sizeBytes: 1,
    durationS: 1,
  });
});

afterEach(() => {
  cleanup();
});

describe("large water confirm early return", () => {
  it("accepts Confirm again after the video check blocked the first one", async () => {
    let settleVideo:
      ((value: { ok: true; mime: string; sizeBytes: number; durationS: number }) => void) | null =
      null;
    videoValidationMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleVideo = resolve;
        }),
    );
    renderSheet();
    enterLargeWater();
    fireEvent.change(screen.getByTestId("qlv2-video-input"), {
      target: { files: [new File([new Uint8Array([1])], "roots.mp4", { type: "video/mp4" })] },
    });
    expect(await screen.findByTestId("qlv2-video-checking")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm amount" }));
    expect(
      await screen.findByText("Wait for the video check to finish before saving."),
    ).toBeInTheDocument();
    expect(wateringWriterMock).not.toHaveBeenCalled();

    await act(async () => {
      settleVideo?.({ ok: true, mime: "video/mp4", sizeBytes: 1, durationS: 1 });
      await Promise.resolve();
    });

    const confirm = screen.getByRole("button", { name: "Confirm amount" });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(1));
  });

  it("accepts Confirm again after the photo check blocked the first one", async () => {
    renderSheet();
    enterLargeWater();
    const png = new File([new Uint8Array(16)], "roots.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("qlv2-photo-library-input"), {
        target: { files: [png] },
      });
    });
    expect(pngGate.pending).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Confirm amount" }));
    expect(
      await screen.findByText("Wait for the photo check to finish before saving."),
    ).toBeInTheDocument();
    expect(wateringWriterMock).not.toHaveBeenCalled();

    await act(async () => {
      pngGate.pending[0]?.({ ok: true });
      await Promise.resolve();
    });

    const confirm = screen.getByRole("button", { name: "Confirm amount" });
    expect(confirm).toBeEnabled();
    expect(screen.getByTestId("qlv2-save")).toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(1));
  });

  it("asks for confirmation again after leaving Water", async () => {
    renderSheet();
    enterLargeWater();
    fireEvent.click(screen.getByRole("button", { name: "Confirm amount" }));
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Note" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "10001" } });
    expect(screen.getByRole("button", { name: "Confirm amount" })).toBeEnabled();
  });
});
