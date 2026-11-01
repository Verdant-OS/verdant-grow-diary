/**
 * Note-first Quick Log V2: the "Not saved yet" line (PR #2643 review P2-1,
 * P3-2). It belongs only to a real failed Note/Water save. Input errors and
 * Feed never show it, and reopening the sheet focuses the note again.
 *
 * Auth, storage and network (supabase.rpc) are mocked. No real credentials.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { quickLogV2SaveFailedError } from "@/lib/quickLogV2NoteFirstRules";

const rpcMock = vi.fn();

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
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

function sheetTree(
  open: boolean,
  action: "note" | "water" | "feed" = "note",
  targetKey: string | undefined = "plant:plant-1",
) {
  const client = sheetClient;
  return (
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={open}
        onOpenChange={vi.fn()}
        defaultTargetKey={targetKey}
        defaultAction={action}
      />
    </QueryClientProvider>
  );
}

let sheetClient = new QueryClient();

function renderSheet(
  action: "note" | "water" | "feed" = "note",
  targetKey: string | undefined = "plant:plant-1",
) {
  sheetClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(sheetTree(true, action, targetKey));
}

const noteBox = () => screen.getByLabelText("Note (optional)") as HTMLTextAreaElement;

beforeEach(() => {
  window.sessionStorage.clear();
  rpcMock.mockReset();
});
afterEach(() => cleanup());

describe("quickLogV2SaveFailedError", () => {
  it("only reports a failed save for a real Note/Water save failure", () => {
    expect(quickLogV2SaveFailedError({ saveFailed: true, action: "note", error: "boom" })).toBe(
      "boom",
    );
    expect(quickLogV2SaveFailedError({ saveFailed: true, action: "water", error: "boom" })).toBe(
      "boom",
    );
    expect(quickLogV2SaveFailedError({ saveFailed: false, action: "note", error: "boom" })).toBe(
      null,
    );
    expect(quickLogV2SaveFailedError({ saveFailed: true, action: "feed", error: "boom" })).toBe(
      null,
    );
  });
});

describe("QuickLogV2Sheet note-first failed-save line", () => {
  it("does not show the failed-save line for an input error (unreadable photo)", async () => {
    renderSheet();
    const notPng = new File(["definitely not a png"], "leaf.png", { type: "image/png" });
    const input = screen
      .getByTestId("qlv2-photo-attachment")
      .querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [notPng] } });
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-note-first-save-state")).toBeNull();
    expect(screen.queryByText(/Not saved yet/)).toBeNull();
  });

  it("does not show the failed-save line on Feed, which has no note box", async () => {
    rpcMock.mockRejectedValue(new Error("network down"));
    renderSheet("feed");
    expect(screen.queryByLabelText("Note (optional)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByTestId("qlv2-note-first-save-state")).toBeNull();
    expect(screen.queryByText(/Not saved yet/)).toBeNull();
  });

  it("focuses the note box again when the sheet is closed and reopened", async () => {
    const view = renderSheet();
    await waitFor(() => expect(document.activeElement).toBe(noteBox()));
    view.rerender(sheetTree(false));
    await waitFor(() => expect(screen.queryByLabelText("Note (optional)")).toBeNull());
    view.rerender(sheetTree(true));
    await waitFor(() => expect(document.activeElement).toBe(noteBox()));
  });
});
