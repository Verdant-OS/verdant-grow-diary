/**
 * Isolated HyperLog prototype → Quick Log photo mapping coverage.
 *
 * Confirms:
 *  - The retired prototype mapper never serializes a blob URL, object URL,
 *    File reference, or image preview string.
 *  - The existing Quick Log editor renders the photo-blocked copy
 *    "Photo preview only — attach/save through Quick Log." once the
 *    prefill is mounted with photoCount > 0.
 *  - HyperLogModal does not import Supabase / write helpers.
 *
 * Hard rules: no new write path, no Supabase calls, no Action Queue.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import QuickLog from "@/components/QuickLog";
import { QUICK_LOG_DRAFT_PHOTO_BLOCKED_COPY } from "@/lib/quickLogDraftPreviewViewModel";
import { buildHyperLogQuickLogPrefill } from "@/lib/hyperLogDraftRules";
import type { HyperLogDemoFormState } from "@/components/HyperLogModal";

if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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
          order: () => ({
            limit: () => {
              const __c: any = {
                abortSignal: () => __c,
                then: (r: any, j?: any) => Promise.resolve({ data: [], error: null }).then(r, j),
              };
              return __c;
            },
          }),
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

const EMPTY_FORM: HyperLogDemoFormState = {
  waterAmount: "",
  waterUnit: "ml",
  waterNote: "",
  feedAmount: "",
  feedNutrient: "",
  feedNote: "",
  defoliateIntensity: "",
  defoliateNote: "",
  freeformNote: "",
  envTemp: "",
  envHumidity: "",
  envVpd: "",
  envCo2: "",
  envNote: "",
};

describe("isolated HyperLog prototype → Quick Log photo mapping", () => {
  it("keeps local photo data out of the mapped prefill", () => {
    const detail = buildHyperLogQuickLogPrefill({
      action: "note",
      form: { ...EMPTY_FORM, freeformNote: "leaf check" },
      photoCount: 1,
      context: {
        plantId: "plant-1",
        plantName: "Plant",
        growId: "grow-1",
        tentId: "tent-1",
        tentName: "Tent",
      },
    });

    expect(detail).not.toBeNull();
    const json = JSON.stringify(detail);
    expect(json).not.toMatch(/blob:/i);
    expect(json).not.toMatch(/File\(/);
    expect(json).not.toMatch(/object\s*url/i);
    expect(json).not.toMatch(/leaf\.jpg/);
    // photoCount is the only photo info that may travel — never URLs or files.
    expect(detail?.photoCount).toBe(1);
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
    const src = readFileSync(resolve(process.cwd(), "src/components/HyperLogModal.tsx"), "utf8");
    expect(src).not.toMatch(/@\/integrations\/supabase\/client/);
    expect(src).not.toMatch(/quicklog_save_manual/);
    expect(src).not.toMatch(/\.rpc\(/);
    expect(src).not.toMatch(/service_role/i);
  });
});
