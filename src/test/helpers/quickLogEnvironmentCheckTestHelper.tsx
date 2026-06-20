/**
 * Quick Log Environment Check — shared test harness.
 *
 * Renders QuickLog directly in Environment Check mode via the existing
 * `prefill` prop (no Radix combobox dance) and returns stable accessible
 * locators for the Environment Check form + compact sensor normalization
 * preview surface.
 *
 * Hard rules:
 *  - Helper-only. No production behavior.
 *  - Does NOT register vi.mock — vi.mock is hoisted per-file and must
 *    stay in the test file that owns the mocks.
 *  - Does NOT assert; assertions stay in the test bodies so failures
 *    surface where the behavior was checked.
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import QuickLog from "@/components/QuickLog";

export interface RenderQuickLogEnvCheckOptions {
  plantId?: string;
  growId?: string;
  prefillOverrides?: Record<string, unknown>;
  propsOverrides?: Record<string, unknown>;
}

export type QuickLogEnvCheckMeasurement =
  | "room-temp-f"
  | "humidity"
  | "vpd"
  | "ec"
  | "water-temp";

const MEASUREMENT_TESTIDS: Record<QuickLogEnvCheckMeasurement, string> = {
  "room-temp-f": "quick-log-env-room-temp-f",
  humidity: "quick-log-env-humidity",
  vpd: "quick-log-env-vpd",
  ec: "quick-log-env-ec",
  "water-temp": "quick-log-env-water-temp",
};

export interface QuickLogEnvCheckHarness {
  dialog: HTMLElement;
  section: HTMLElement;
  /** Set a manual measurement by its known field key. */
  setMeasurement: (field: QuickLogEnvCheckMeasurement, value: string) => void;
  /** Get a measurement input element. */
  getMeasurementInput: (field: QuickLogEnvCheckMeasurement) => HTMLElement;
  /** The slot wrapping the compact normalization preview (or null if absent). */
  getPreviewSlot: () => HTMLElement | null;
  /** The inner SensorNormalizationPreviewPanel (or null if absent). */
  getPreviewPanel: () => HTMLElement | null;
  /** Convenience: read `data-writes-enabled` from the inner panel. */
  getPreviewWritesEnabled: () => string | null;
  /** Accessible badge text contents from the preview, in order. */
  getPreviewBadgeLabels: () => string[];
  /** The tent status node (data-tent-status attribute) or null. */
  getPreviewTentStatus: () => HTMLElement | null;
  /** Warning chip labels rendered in the preview. */
  getPreviewWarningLabels: () => string[];
  /** Empty-state node text, or null when not rendered. */
  getPreviewEmptyState: () => string | null;
}

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/**
 * Render QuickLog already in Environment Check mode and return stable
 * locators. The helper looks up the Environment Check section by its
 * existing test id, which is the canonical marker production code uses
 * for that section.
 */
export function renderQuickLogEnvironmentCheck(
  opts: RenderQuickLogEnvCheckOptions = {},
): QuickLogEnvCheckHarness {
  const plantId = opts.plantId ?? "plant-1";
  const growId = opts.growId ?? "grow-1";
  const prefill = {
    plantId,
    growId,
    eventType: "environment" as const,
    ...(opts.prefillOverrides ?? {}),
  };
  renderWithClient(
    <QuickLog open onOpenChange={() => undefined} prefill={prefill} {...(opts.propsOverrides ?? {})} />,
  );
  const dialog = screen.getByRole("dialog");
  const section = within(dialog).getByTestId("quick-log-environment-check-section");

  const getMeasurementInput = (field: QuickLogEnvCheckMeasurement) =>
    within(section).getByTestId(MEASUREMENT_TESTIDS[field]);

  const setMeasurement = (field: QuickLogEnvCheckMeasurement, value: string) => {
    fireEvent.change(getMeasurementInput(field), { target: { value } });
  };

  const getPreviewSlot = () =>
    (screen.queryByTestId("quick-log-env-normalization-preview-slot") as HTMLElement | null);
  const getPreviewPanel = () => {
    const slot = getPreviewSlot();
    if (!slot) return null;
    return within(slot).queryByTestId("sensor-normalization-preview-panel") as HTMLElement | null;
  };
  const getPreviewWritesEnabled = () => {
    const panel = getPreviewPanel();
    return panel ? panel.getAttribute("data-writes-enabled") : null;
  };
  const getPreviewBadgeLabels = () => {
    const slot = getPreviewSlot();
    if (!slot) return [];
    return within(slot)
      .queryAllByTestId("sensor-normalization-preview-badge")
      .map((n) => n.textContent ?? "");
  };
  const getPreviewTentStatus = () => {
    const slot = getPreviewSlot();
    if (!slot) return null;
    return within(slot).queryByTestId("sensor-normalization-preview-tent-status") as HTMLElement | null;
  };
  const getPreviewWarningLabels = () => {
    const slot = getPreviewSlot();
    if (!slot) return [];
    return within(slot)
      .queryAllByTestId("sensor-normalization-preview-warning")
      .map((n) => n.textContent ?? "");
  };
  const getPreviewEmptyState = () => {
    const slot = getPreviewSlot();
    if (!slot) return null;
    const node = within(slot).queryByTestId("sensor-normalization-preview-empty-state");
    return node ? node.textContent : null;
  };

  return {
    dialog,
    section,
    setMeasurement,
    getMeasurementInput,
    getPreviewSlot,
    getPreviewPanel,
    getPreviewWritesEnabled,
    getPreviewBadgeLabels,
    getPreviewTentStatus,
    getPreviewWarningLabels,
    getPreviewEmptyState,
  };
}
