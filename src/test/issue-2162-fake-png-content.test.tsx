/**
 * #2162 — a text file renamed to .png is rejected by its bytes, not its name.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

describe("issue 2162 — fake png content", () => {
  it("rejects a text file renamed to .png and does not preview it", async () => {
    renderSheet();
    const library = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    const fake = new File(["this is plain text, not a png"], "fake.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(library, { target: { files: [fake] } });
    });
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent ?? "").toMatch(/png|photo|image/i);
    });
    expect(screen.queryByTestId("qlv2-photo-preview")).toBeNull();
    expect(screen.queryByText(/Log and photo saved/i)).toBeNull();
  });

  it("still accepts a file whose bytes are a real PNG", async () => {
    renderSheet();
    const library = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    const real = new File([PNG_SIGNATURE], "leaf.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(library, { target: { files: [real] } });
    });
    expect(await screen.findByTestId("qlv2-photo-preview")).toBeTruthy();
  });
});
