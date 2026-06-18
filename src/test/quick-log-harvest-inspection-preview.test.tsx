/**
 * QuickLog — Harvest Watch inspection preview mounted tests.
 *
 * Verifies: preview shows for harvest-watch-inspection prefills, hides for
 * normal prefills, surfaces preset labels + mandated caution/review copy +
 * prefilled note, renders optional Angle/Lighting fields only for the
 * close_flower_photo preset, and never auto-saves / never imports AI,
 * alerts, or Action Queue helpers.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import QuickLog, { type QuickLogPrefill } from "@/components/QuickLog";
import { buildHarvestInspectionQuickLogPrefill } from "@/lib/harvestInspectionQuickLogRules";

if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

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
    grows: [{ id: "grow-1", name: "Grow", stage: "flower" }],
    activeGrow: { id: "grow-1", name: "Grow", stage: "flower" },
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

function renderQL(prefill: QuickLogPrefill | null): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (
    <QueryClientProvider client={qc}>
      <QuickLog open onOpenChange={() => undefined} prefill={prefill} />
    </QueryClientProvider>
  );
  render(ui);
  return ui;
}

const ctx = {
  plantId: "plant-1",
  plantName: "Plant",
  growId: "grow-1",
  tentId: "tent-1",
};

describe("QuickLog — harvest inspection preview", () => {
  it("renders the preview for harvest-watch-inspection prefills", () => {
    renderQL(
      buildHarvestInspectionQuickLogPrefill({
        preset: "trichome_inspection",
        context: ctx,
      }),
    );
    const dialog = screen.getByRole("dialog");
    const panel = within(dialog).getByTestId(
      "quick-log-harvest-inspection-preview",
    );
    expect(panel).toHaveAttribute("data-preset", "trichome_inspection");
  });

  it("does NOT render the preview for normal Quick Log prefills", () => {
    renderQL({
      plantId: "plant-1",
      growId: "grow-1",
      tentId: "tent-1",
      eventType: "observation",
      source: "hyperlog",
      note: "Hello",
    });
    expect(
      screen.queryByTestId("quick-log-harvest-inspection-preview"),
    ).toBeNull();
  });

  it("shows the correct preset label for each preset", () => {
    const cases: Array<[Parameters<typeof buildHarvestInspectionQuickLogPrefill>[0]["preset"], string]> = [
      ["trichome_inspection", "Trichome inspection"],
      ["pistil_recession", "Pistil / recession observation"],
      ["bud_maturity", "Bud maturity note"],
      ["close_flower_photo", "Close flower photo"],
    ];
    for (const [preset, label] of cases) {
      const { unmount } = render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <QuickLog
            open
            onOpenChange={() => undefined}
            prefill={buildHarvestInspectionQuickLogPrefill({ preset, context: ctx })}
          />
        </QueryClientProvider>,
      );
      const labelNode = screen.getByTestId(
        "quick-log-harvest-inspection-preview-label",
      );
      expect(labelNode).toHaveTextContent(label);
      unmount();
    }
  });

  it("surfaces caution + review copy + the prefilled note", () => {
    const prefill = buildHarvestInspectionQuickLogPrefill({
      preset: "trichome_inspection",
      context: ctx,
    });
    renderQL(prefill);
    expect(
      screen.getByTestId("quick-log-harvest-inspection-preview-caution"),
    ).toHaveTextContent(
      "Harvest Watch is evidence-only. The grower decides.",
    );
    expect(
      screen.getByTestId("quick-log-harvest-inspection-preview-review"),
    ).toHaveTextContent(
      "Review this diary evidence before saving. This does not create an alert, Action Queue item, or harvest instruction.",
    );
    expect(
      screen.getByTestId("quick-log-harvest-inspection-preview-note"),
    ).toHaveTextContent("Trichome inspection note");
    expect(
      screen.getByTestId("quick-log-harvest-inspection-preview-grower"),
    ).toHaveTextContent(/Grower reviews before saving/i);
  });

  it("shows optional Angle + Lighting fields only for close_flower_photo", () => {
    renderQL(
      buildHarvestInspectionQuickLogPrefill({
        preset: "close_flower_photo",
        context: ctx,
      }),
    );
    expect(screen.getByTestId("quick-log-harvest-photo-comparison")).toBeTruthy();
    expect(screen.getByTestId("quick-log-harvest-photo-angle")).toBeTruthy();
    expect(screen.getByTestId("quick-log-harvest-photo-lighting")).toBeTruthy();
  });

  it("does NOT show Angle/Lighting fields for non-photo presets", () => {
    for (const preset of ["trichome_inspection", "pistil_recession", "bud_maturity"] as const) {
      const { unmount } = render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <QuickLog
            open
            onOpenChange={() => undefined}
            prefill={buildHarvestInspectionQuickLogPrefill({ preset, context: ctx })}
          />
        </QueryClientProvider>,
      );
      expect(screen.queryByTestId("quick-log-harvest-photo-comparison")).toBeNull();
      expect(screen.queryByTestId("quick-log-harvest-photo-angle")).toBeNull();
      expect(screen.queryByTestId("quick-log-harvest-photo-lighting")).toBeNull();
      unmount();
    }
  });

  it("renders without triggering an auto-save", () => {
    renderQL(
      buildHarvestInspectionQuickLogPrefill({
        preset: "close_flower_photo",
        context: ctx,
      }),
    );
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe("static safety — harvest inspection preview rules module", () => {
  it("does not import AI, alerts, Action Queue, Supabase write, or device helpers", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/harvestInspectionQuickLogPreviewRules.ts"),
      "utf8",
    );
    const importLines = src.split("\n").filter((l) => /^\s*import\s/.test(l));
    const joined = importLines.join("\n");
    expect(joined).not.toContain("@supabase/");
    expect(joined).not.toContain("supabase/client");
    expect(joined).not.toContain("ai-doctor");
    expect(joined).not.toContain("aiDoctor");
    expect(joined).not.toContain("actionQueue");
    expect(joined).not.toContain("action_queue");
    expect(joined).not.toContain("/alerts");
    expect(joined).not.toContain("deviceControl");
  });
});
