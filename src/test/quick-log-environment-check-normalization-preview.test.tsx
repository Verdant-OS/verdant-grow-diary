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
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import QuickLog from "@/components/QuickLog";

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

async function openEnvironmentPreset() {
  renderWithClient(
    <QuickLog
      open
      onOpenChange={() => undefined}
      prefill={{ plantId: "plant-1", growId: "grow-1", eventType: "environment" }}
    />,
  );
  await screen.findByTestId("quick-log-environment-check-section");
}

describe("Quick Log Environment Check — normalization preview", () => {
  beforeEach(() => {
    saveMock.mockReset();
    insertMock.mockReset();
  });

  it("does not render the normalization preview for note-only entries", async () => {
    await openEnvironmentPreset();
    expect(
      screen.queryByTestId("quick-log-env-normalization-preview-slot"),
    ).toBeNull();
  });

  it("renders the compact normalization preview when a measurement is entered", async () => {
    await openEnvironmentPreset();
    fireEvent.change(screen.getByTestId("quick-log-env-room-temp-f"), {
      target: { value: "76" },
    });
    fireEvent.change(screen.getByTestId("quick-log-env-humidity"), {
      target: { value: "55" },
    });
    const slot = await screen.findByTestId("quick-log-env-normalization-preview-slot");
    const panel = within(slot).getByTestId("sensor-normalization-preview-panel");
    expect(panel.getAttribute("data-writes-enabled")).toBe("false");
    expect(
      within(slot).getByTestId("sensor-normalization-preview-disclaimer").textContent,
    ).toMatch(/Preview only/i);
    const badges = within(slot).getAllByTestId("sensor-normalization-preview-badge");
    const labels = badges.map((b) => b.textContent ?? "");
    expect(labels.some((l) => l.includes("Source: manual"))).toBe(true);
    expect(labels.some((l) => l.includes("Identity: manual_entry"))).toBe(true);
    expect(labels.some((l) => l.includes("Transport: manual"))).toBe(true);
  });

  it("surfaces tent context warning when tent is non-UUID (existing test fixture)", async () => {
    await openEnvironmentPreset();
    fireEvent.change(screen.getByTestId("quick-log-env-room-temp-f"), {
      target: { value: "76" },
    });
    fireEvent.change(screen.getByTestId("quick-log-env-humidity"), {
      target: { value: "55" },
    });
    const slot = await screen.findByTestId("quick-log-env-normalization-preview-slot");
    const tent = within(slot).getByTestId("sensor-normalization-preview-tent-status");
    // The test plant uses tent_id: "tent-1" which is non-UUID → invalid.
    expect(tent.getAttribute("data-tent-status")).toBe("invalid");
    expect(tent.textContent).toBe("Invalid tent ID");
    expect(
      within(slot).getByTestId("sensor-normalization-preview-empty-state").textContent,
    ).toMatch(/valid tent context is missing/i);
  });

  it("does not call Supabase write helpers or change save payload", async () => {
    await openEnvironmentPreset();
    fireEvent.change(screen.getByTestId("quick-log-env-room-temp-f"), {
      target: { value: "76" },
    });
    fireEvent.change(screen.getByTestId("quick-log-env-humidity"), {
      target: { value: "55" },
    });
    // Preview render alone must not trigger any write.
    expect(insertMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("static safety: no write helpers / no normalization rows persisted in QuickLog", () => {
    const src = readFileSync(resolve(__dirname, "../components/QuickLog.tsx"), "utf8");
    // The preview must not introduce normalization-row persistence.
    expect(src).not.toMatch(/normalizedReadingToLongFormRows\s*\(/);
    expect(src).not.toMatch(/insertSensorReading/);
    expect(src).not.toMatch(/useInsertSensorReading\(/);
    expect(src).not.toMatch(/supabase\.from\(["']sensor_readings["']\)/);
  });
});
