/**
 * HyperLog → Quick Log photo handoff e2e (presenter-only).
 *
 * Confirms:
 *  - When HyperLog commits with locally attached photos, the dispatched
 *    Quick Log prefill never serializes a blob: URL, object URL, File
 *    reference, or image preview string.
 *  - The existing Quick Log editor renders the photo-blocked copy
 *    "Photo preview only — attach/save through Quick Log." once the
 *    prefill is mounted with photoCount > 0.
 *  - HyperLogModal does not import Supabase / write helpers.
 *
 * Hard rules: no new write path, no Supabase calls, no Action Queue.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MemoryRouter } from "react-router-dom";
import GlobalFastAddButton from "@/components/GlobalFastAddButton";
import QuickLog, { type QuickLogPrefill } from "@/components/QuickLog";
import { QUICK_LOG_DRAFT_PHOTO_BLOCKED_COPY } from "@/lib/quickLogDraftPreviewViewModel";

if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Stub URL.createObjectURL so HyperLog can build local previews safely.
if (typeof URL.createObjectURL !== "function") {
  // @ts-expect-error jsdom polyfill
  URL.createObjectURL = () => "blob:hyperlog-test";
}
if (typeof URL.revokeObjectURL !== "function") {
  // @ts-expect-error jsdom polyfill
  URL.revokeObjectURL = () => undefined;
}

// ---- Minimal QuickLog mocks (mirrors quick-log-environment-check.test.tsx)
const saveMock = vi.fn().mockResolvedValue({ ok: true, eventId: "ev-1" });
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: saveMock, saving: false, error: null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: vi.fn(),
      update: () => ({ eq: vi.fn() }),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Grow", stage: "veg" }],
    activeGrow: { id: "grow-1", name: "Grow", stage: "veg" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

type Dispatched = { name: string; detail: QuickLogPrefill };
const captured: Dispatched[] = [];
const handler = (e: Event) => {
  const ce = e as CustomEvent<QuickLogPrefill>;
  captured.push({ name: e.type, detail: ce.detail });
};

beforeEach(() => {
  captured.length = 0;
  window.addEventListener("verdant:open-quicklog", handler as EventListener);
});
afterEach(() => {
  window.removeEventListener("verdant:open-quicklog", handler as EventListener);
});

describe("HyperLog → Quick Log photo handoff", () => {
  it("commits with a local photo without leaking File/blob refs into the dispatched prefill", () => {
    render(
      <MemoryRouter initialEntries={["/plants/plant-1"]}>
        <GlobalFastAddButton />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-hyperlog-note"));

    const file = new File(["x"], "leaf.jpg", { type: "image/jpeg" });
    const input = screen.getByTestId("hyperlog-photo-input") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    act(() => {
      fireEvent.click(screen.getByTestId("hyperlog-commit"));
    });

    expect(captured).toHaveLength(1);
    const json = JSON.stringify(captured[0].detail);
    expect(json).not.toMatch(/blob:/i);
    expect(json).not.toMatch(/File\(/);
    expect(json).not.toMatch(/object\s*url/i);
    expect(json).not.toMatch(/leaf\.jpg/);
    // photoCount is the only photo info that may travel — never URLs or files.
    expect(captured[0].detail.photoCount).toBe(1);
  });

  it("Quick Log shows the photo-blocked copy when a HyperLog prefill carries photoCount > 0", () => {
    renderWithClient(
      <QuickLog
        open
        onOpenChange={() => undefined}
        prefill={{
          plantId: "plant-1",
          growId: "grow-1",
          tentId: "tent-1",
          eventType: "environment",
          source: "hyperlog",
          note: "Env check — Temp 24°C, RH 58%",
          photoCount: 2,
        }}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const photoNode = within(dialog).getByTestId("quick-log-draft-preview-photo");
    expect(photoNode).toHaveTextContent(QUICK_LOG_DRAFT_PHOTO_BLOCKED_COPY);
  });

  it("HyperLogModal source does not import Supabase/client/write helpers", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/HyperLogModal.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/@\/integrations\/supabase\/client/);
    expect(src).not.toMatch(/quicklog_save_manual/);
    expect(src).not.toMatch(/\.rpc\(/);
    expect(src).not.toMatch(/service_role/i);
  });
});
