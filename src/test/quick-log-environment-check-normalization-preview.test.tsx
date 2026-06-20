/**
 * Quick Log Environment Check — sensor normalization preview integration.
 *
 * Verifies:
 *  - the compact normalization preview renders only when at least one
 *    Environment Check measurement is entered
 *  - it does not render for note-only entries
 *  - it carries source=manual / identity=manual_entry / transport=manual
 *  - it surfaces tent context warnings via the existing rules
 *  - it never calls a write helper (no insertSensorReading, no inserts)
 *  - it does not change the existing quicklog_save_manual payload
 *  - the Environment Check selector is reachable via the real Radix
 *    combobox flow with a stable accessible name
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import QuickLog from "@/components/QuickLog";
import { renderQuickLogEnvironmentCheck } from "./helpers/quickLogEnvironmentCheckTestHelper";

const saveMock = vi.fn();
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: (...a: unknown[]) => saveMock(...a),
    saving: false,
    error: null,
  }),
}));

const insertMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: insertMock,
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

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Test Grow", stage: "veg" }],
    activeGrow: { id: "grow-1", name: "Test Grow", stage: "veg" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-1", name: "Verdant Test Plant", tent_id: "tent-1", grow_id: "grow-1" },
    ],
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  saveMock.mockReset();
  insertMock.mockReset();
});

describe("Quick Log Environment Check — normalization preview", () => {
  it("shared helper opens QuickLog directly in Environment Check mode", () => {
    const h = renderQuickLogEnvironmentCheck();
    expect(h.dialog).toBeInTheDocument();
    expect(h.section).toBeInTheDocument();
  });

  it("does not render the normalization preview for note-only entries", () => {
    const h = renderQuickLogEnvironmentCheck();
    expect(h.getPreviewSlot()).toBeNull();
  });

  it("renders the compact normalization preview when a measurement is entered", () => {
    const h = renderQuickLogEnvironmentCheck();
    h.setMeasurement("room-temp-f", "76");
    h.setMeasurement("humidity", "55");
    expect(h.getPreviewPanel()).not.toBeNull();
    expect(h.getPreviewWritesEnabled()).toBe("false");
    const labels = h.getPreviewBadgeLabels();
    expect(labels.some((l) => l.includes("Source: manual"))).toBe(true);
    expect(labels.some((l) => l.includes("Identity: manual_entry"))).toBe(true);
    expect(labels.some((l) => l.includes("Transport: manual"))).toBe(true);
    const slot = h.getPreviewSlot()!;
    expect(within(slot).getByTestId("sensor-normalization-preview-disclaimer").textContent).toMatch(
      /Preview only/i,
    );
  });

  it("surfaces tent context warning when tent is non-UUID (existing test fixture)", () => {
    const h = renderQuickLogEnvironmentCheck();
    h.setMeasurement("room-temp-f", "76");
    h.setMeasurement("humidity", "55");
    const tent = h.getPreviewTentStatus()!;
    expect(tent.getAttribute("data-tent-status")).toBe("invalid");
    expect(tent.textContent).toBe("Invalid tent ID");
    expect(h.getPreviewEmptyState()).toMatch(/valid tent context is missing/i);
  });

  it("does not call Supabase write helpers or change save payload on preview render", () => {
    const h = renderQuickLogEnvironmentCheck();
    h.setMeasurement("room-temp-f", "76");
    h.setMeasurement("humidity", "55");
    expect(insertMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("static safety: no write helpers / no normalization rows persisted in QuickLog", () => {
    const src = readFileSync(
      resolve(__dirname, "../components/QuickLog.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/normalizedReadingToLongFormRows\s*\(/);
    expect(src).not.toMatch(/insertSensorReading/);
    expect(src).not.toMatch(/useInsertSensorReading\(/);
    expect(src).not.toMatch(/supabase\.from\(["']sensor_readings["']\)/);
  });

  it("static safety: shared helper does not import write/IO paths", () => {
    const src = readFileSync(
      resolve(__dirname, "helpers/quickLogEnvironmentCheckTestHelper.tsx"),
      "utf8",
    );
    const forbidden = [
      /insertSensorReading/,
      /useInsertSensorReading\(/,
      /\.insert\(/,
      /\.upsert\(/,
      /\.update\(/,
      /\.delete\(/,
      /\.upload\(/,
      /supabase\.from\(["']sensor_readings["']\)/,
      /functions\.invoke/,
      /from\(["']action_queue["']\)/,
      /from\(["']alerts["']\)/,
      /service_role/i,
      /bridge[_-]?token/i,
    ];
    for (const p of forbidden) {
      expect(p.test(src), `unexpected match: ${p}`).toBe(false);
    }
  });
});

describe("Quick Log Environment Check — selector accessibility", () => {
  it("Event combobox exposes its visible 'Event' label as accessible name", () => {
    renderWithClient(
      <QuickLog
        open
        onOpenChange={() => undefined}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );
    const dialog = screen.getByRole("dialog");
    // Radix Select trigger renders role=combobox; the visible "Event"
    // label is associated via htmlFor/id, so the accessible name resolves.
    const combobox = within(dialog).getByRole("combobox", { name: /event/i });
    expect(combobox).toBeInTheDocument();
  });

  it("selecting Environment Check via the real combobox flow renders the section", async () => {
    // Radix Select calls Element.scrollIntoView when opened; jsdom lacks it.
    const originalScrollIntoView = (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView;
    (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => undefined;
    // Also stub hasPointerCapture for Radix.
    const originalHasPC = (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture;
    (Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false;
    try {
      renderWithClient(
        <QuickLog
          open
          onOpenChange={() => undefined}
          prefill={{ plantId: "plant-1", growId: "grow-1" }}
        />,
      );
      const dialog = screen.getByRole("dialog");
      const combobox = within(dialog).getByRole("combobox", { name: /event/i });
      fireEvent.pointerDown(combobox, { button: 0, ctrlKey: false, pointerType: "mouse" });
      fireEvent.click(combobox);
      const option = await screen.findByRole("option", { name: /environment check/i });
      fireEvent.click(option);
      expect(
        await within(dialog).findByTestId("quick-log-environment-check-section"),
      ).toBeInTheDocument();
    } finally {
      if (originalScrollIntoView) {
        (Element.prototype as unknown as { scrollIntoView: typeof originalScrollIntoView }).scrollIntoView = originalScrollIntoView;
      }
      if (originalHasPC) {
        (Element.prototype as unknown as { hasPointerCapture: typeof originalHasPC }).hasPointerCapture = originalHasPC;
      }
    }
  });
});
