/**
 * Note-first retry status must follow real save failures, not only the
 * exact reason `save_failed`. `Error("network down")` falls through the
 * classifier to `save_failed`; a thrown `Failed to fetch` is `network_error`,
 * and a missing RPC is `rpc_unavailable`. Photo upload failures happen before
 * either write. History and receipt outcomes still point at Timeline.
 *
 * Auth, storage and network are mocked. No real credentials.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

const rpcMock = vi.fn();
const storageUploadMock = vi.fn();
const ids = vi.hoisted(() => ({
  plantId: "33333333-3333-4333-8333-333333333333",
  tentId: "55555555-5555-4555-8555-555555555555",
  growId: "66666666-6666-4666-8666-666666666666",
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => storageUploadMock(...args),
        remove: () => Promise.resolve({ data: null, error: null }),
      }),
    },
  },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: ids.plantId, name: "Plant 1", tent_id: ids.tentId, grow_id: ids.growId }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: ids.tentId, name: "Tent 1", grow_id: ids.growId }] }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: ids.growId, name: "Grow 1" }] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={true}
        onOpenChange={vi.fn()}
        defaultTargetKey={`plant:${ids.plantId}`}
      />
    </QueryClientProvider>,
  );
}

const noteBox = () => screen.getByLabelText("Note (optional)") as HTMLTextAreaElement;

function attachJpeg() {
  const input = screen
    .getByTestId("qlv2-photo-attachment")
    .querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: {
      files: [new File([new Uint8Array([1, 2, 3])], "leaf.jpg", { type: "image/jpeg" })],
    },
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
  rpcMock.mockReset();
  storageUploadMock.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:mock");
});
afterEach(() => cleanup());

describe("QuickLogV2Sheet note-first retry status", () => {
  it("shows Not saved yet when a thrown fetch failure is classified as network_error", async () => {
    rpcMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderSheet();
    fireEvent.change(noteBox(), { target: { value: "Leaf edges curling" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-note-first-save-state")).toHaveAttribute(
        "data-state",
        "failed",
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the server.");
    expect(screen.getByTestId("qlv2-note-first-save-state")).toHaveTextContent(/Not saved yet/);
    expect(noteBox().value).toBe("Leaf edges curling");
  });

  it("shows Not saved yet when the save RPC is unavailable", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    renderSheet();
    fireEvent.change(noteBox(), { target: { value: "Leaf edges curling" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-note-first-save-state")).toHaveAttribute(
        "data-state",
        "failed",
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The save service is not available on this database yet.",
    );
    expect(noteBox().value).toBe("Leaf edges curling");
  });

  it("shows Not saved yet when a photo upload fails before the note write", async () => {
    storageUploadMock.mockResolvedValue({ data: null, error: { message: "offline" } });
    renderSheet();
    fireEvent.change(noteBox(), { target: { value: "Leaf edges curling" } });
    attachJpeg();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-note-first-save-state")).toHaveAttribute(
        "data-state",
        "failed",
      ),
    );
    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Photo upload failed: offline");
    expect(noteBox().value).toBe("Leaf edges curling");
  });

  it("shows Not saved yet when a photo upload fails before the watering write", async () => {
    storageUploadMock.mockResolvedValue({ data: null, error: { message: "offline" } });
    Object.defineProperty(window.navigator, "locks", {
      configurable: true,
      value: {
        request: (_name: string, _options: unknown, callback: () => unknown) =>
          Promise.resolve(callback()),
      },
    });
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "250" } });
    fireEvent.change(noteBox(), { target: { value: "Runoff was light" } });
    attachJpeg();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-note-first-save-state")).toHaveAttribute(
        "data-state",
        "failed",
      ),
    );
    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Photo upload failed: offline");
    expect(noteBox().value).toBe("Runoff was light");
  });

  it("keeps Timeline outcomes off the retry status line", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: null, environment_event_id: null },
      error: null,
    });
    renderSheet();
    fireEvent.change(noteBox(), { target: { value: "Leaf edges curling" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("could not be confirmed");
    expect(screen.queryByTestId("qlv2-note-first-save-state")).toBeNull();
    expect(screen.queryByText(/Not saved yet/)).toBeNull();
  });
});
