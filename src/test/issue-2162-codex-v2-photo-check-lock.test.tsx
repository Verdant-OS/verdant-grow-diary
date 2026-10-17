/**
 * Codex finding: a PNG claim that is still being read must not leave the
 * previous photo saveable, and a late result must not replace a newer choice.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const pngGate = vi.hoisted(() => ({
  pending: [] as Array<(result: { ok: true } | { ok: false; message: string }) => void>,
}));

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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ data: { path: "uploaded" }, error: null })),
        remove: vi.fn(async () => ({ data: null, error: null })),
      }),
    },
    from: () => ({
      insert: vi.fn(async () => ({ data: null, error: null })),
      select: vi.fn(),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-test-1" } }),
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

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={() => {}} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  pngGate.pending.length = 0;
  window.sessionStorage.clear();
  if (typeof URL.createObjectURL !== "function") {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(
      () => "blob:quicklog-v2-preview",
    );
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:quicklog-v2-preview");
  }
});

afterEach(() => cleanup());

describe("Quick Log v2 photo check lock", () => {
  it("disables save while a PNG claim is pending and drops a stale result", async () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "checking the photo" },
    });
    const library = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    const jpeg = new File([new Uint8Array([1, 2, 3])], "leaf.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(library, { target: { files: [jpeg] } });
    });
    expect(await screen.findByTestId("qlv2-photo-preview")).toBeTruthy();
    expect(screen.getByTestId("qlv2-save")).toBeEnabled();

    const first = new File([new Uint8Array(16)], "first.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(library, { target: { files: [first] } });
    });
    expect(screen.getByTestId("qlv2-save")).toBeDisabled();
    expect(screen.getByTestId("qlv2-save-status").textContent ?? "").toMatch(/checking photo/i);
    expect(screen.queryByTestId("qlv2-photo-preview")).toBeNull();

    const second = new File(["not a png, just text"], "second.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(library, { target: { files: [second] } });
    });
    expect(pngGate.pending).toHaveLength(2);

    await act(async () => {
      pngGate.pending[0]?.({ ok: true });
    });
    expect(screen.queryByTestId("qlv2-photo-preview")).toBeNull();

    await act(async () => {
      pngGate.pending[1]?.({
        ok: false,
        message: "That file isn't a PNG image. Choose a real photo.",
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent ?? "").toMatch(/isn't a PNG/i);
    });
    expect(screen.queryByTestId("qlv2-photo-preview")).toBeNull();
    expect(screen.getByTestId("qlv2-save")).toBeEnabled();
  });
});
