import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { SensorNormalizationPreviewPanel } from "@/components/SensorNormalizationPreviewPanel";
import { buildSensorNormalizationPreviewViewModel } from "@/lib/sensors/sensorNormalizationPreviewViewModel";

const TENT = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-06-15T12:00:00Z");
const FRESH = "2026-06-15T11:50:00Z";

function buildVm(overrides?: { payload?: unknown; tentId?: string | null; capturedAt?: string | null }) {
  return buildSensorNormalizationPreviewViewModel({
    payload: overrides?.payload ?? { temperature_c: 24, humidity: 50 },
    options: {
      source: "csv",
      sourceIdentity: "csv_import",
      transport: "csv",
      tentId: overrides?.tentId === undefined ? TENT : overrides.tentId,
      capturedAt: overrides?.capturedAt === undefined ? FRESH : overrides.capturedAt,
      now: NOW,
    },
  });
}

describe("SensorNormalizationPreviewPanel", () => {
  it("renders writes-disabled marker and the disclaimer", () => {
    render(<SensorNormalizationPreviewPanel viewModel={buildVm()} />);
    const panel = screen.getByTestId("sensor-normalization-preview-panel");
    expect(panel.getAttribute("data-writes-enabled")).toBe("false");
    expect(
      screen.getByTestId("sensor-normalization-preview-disclaimer").textContent,
    ).toMatch(/Preview only/i);
  });

  it("renders source, identity, transport, confidence badges", () => {
    render(<SensorNormalizationPreviewPanel viewModel={buildVm()} />);
    const badges = screen.getAllByTestId("sensor-normalization-preview-badge");
    const labels = badges.map((b) => b.textContent ?? "");
    expect(labels.some((l) => l.includes("Source: csv"))).toBe(true);
    expect(labels.some((l) => l.includes("Identity: csv_import"))).toBe(true);
    expect(labels.some((l) => l.includes("Transport: csv"))).toBe(true);
    expect(labels.some((l) => l.includes("Confidence:"))).toBe(true);
  });

  it("renders stale badge when reading is stale", () => {
    render(
      <SensorNormalizationPreviewPanel
        viewModel={buildVm({ capturedAt: "2026-06-15T08:00:00Z" })}
      />,
    );
    const badges = screen.getAllByTestId("sensor-normalization-preview-badge");
    expect(badges.some((b) => b.textContent === "Stale")).toBe(true);
  });

  it("renders invalid badge and no-metrics empty state when payload has no metrics", () => {
    render(
      <SensorNormalizationPreviewPanel viewModel={buildVm({ payload: {} })} />,
    );
    const badges = screen.getAllByTestId("sensor-normalization-preview-badge");
    expect(badges.some((b) => b.textContent === "Invalid")).toBe(true);
    const empty = screen.getByTestId("sensor-normalization-preview-empty-state");
    expect(empty.textContent).toMatch(/No usable sensor metrics were found/i);
    expect(empty.textContent).toMatch(/Check the input fields/i);
  });

  it("renders warning chips with friendly labels", () => {
    render(
      <SensorNormalizationPreviewPanel viewModel={buildVm({ tentId: null })} />,
    );
    const list = screen.getByTestId("sensor-normalization-preview-warnings");
    const items = within(list).getAllByTestId("sensor-normalization-preview-warning");
    expect(items.some((el) => el.getAttribute("data-code") === "missing_tent_id")).toBe(true);
  });

  it("renders warning disclosure trigger when warnings exist", () => {
    render(
      <SensorNormalizationPreviewPanel viewModel={buildVm({ tentId: null })} />,
    );
    expect(
      screen.getByTestId("sensor-normalization-preview-warning-disclosure"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Why am I seeing this warning?"),
    ).toBeInTheDocument();
  });

  it("does not render warning disclosure when there are no warnings", () => {
    render(<SensorNormalizationPreviewPanel viewModel={buildVm()} />);
    expect(
      screen.queryByTestId("sensor-normalization-preview-warning-disclosure"),
    ).toBeNull();
  });

  it("disclosure expanded copy says warnings are data-quality signals, not plant diagnosis", () => {
    render(
      <SensorNormalizationPreviewPanel viewModel={buildVm({ tentId: null })} />,
    );
    const disclosure = screen.getByTestId(
      "sensor-normalization-preview-warning-disclosure",
    );
    expect(disclosure.textContent).toMatch(/data-quality signals/i);
    expect(disclosure.textContent).toMatch(/not plant diagnosis/i);
  });

  it("disclosure expanded copy says warnings do not save sensor readings", () => {
    render(
      <SensorNormalizationPreviewPanel viewModel={buildVm({ tentId: null })} />,
    );
    const disclosure = screen.getByTestId(
      "sensor-normalization-preview-warning-disclosure",
    );
    expect(disclosure.textContent).toMatch(/do not save sensor readings/i);
  });

  it("disclosure expanded copy includes note-only guidance", () => {
    render(
      <SensorNormalizationPreviewPanel viewModel={buildVm({ tentId: null })} />,
    );
    const disclosure = screen.getByTestId(
      "sensor-normalization-preview-warning-disclosure",
    );
    expect(disclosure.textContent).toMatch(/note-only/i);
    expect(disclosure.textContent).toMatch(/source, timestamp, tent context, and units/i);
  });

  it("disclosure does not render raw payload or private-looking values", () => {
    const payload = {
      temperature_c: 24,
      humidity: 50,
      service_role: "leak-service-role",
      bridge_token: "leak-bridge-token",
      raw_payload: { secret: "leak-raw" },
    };
    const { container } = render(
      <SensorNormalizationPreviewPanel viewModel={buildVm({ payload, tentId: null })} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("leak-service-role");
    expect(text).not.toContain("leak-bridge-token");
    expect(text).not.toContain("leak-raw");
    expect(text).not.toContain("service_role");
    expect(text).not.toContain("bridge_token");
    expect(text).not.toMatch(/"secret"/);
  });

  it("renders normalized metric summary rows only for non-null metrics", () => {
    render(<SensorNormalizationPreviewPanel viewModel={buildVm()} />);
    const rows = screen.getAllByTestId("sensor-normalization-preview-metric-row");
    const metrics = rows.map((r) => r.querySelector("td")?.textContent);
    expect(metrics).toContain("temperature_c");
    expect(metrics).toContain("humidity_pct");
    expect(metrics).not.toContain("co2_ppm");
  });

  it("renders long-form row preview table when rows exist", () => {
    render(<SensorNormalizationPreviewPanel viewModel={buildVm()} />);
    expect(screen.getByTestId("sensor-normalization-preview-long-form")).toBeInTheDocument();
    const rows = screen.getAllByTestId("sensor-normalization-preview-long-form-row");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("renders empty state when no long-form rows are generated", () => {
    render(
      <SensorNormalizationPreviewPanel viewModel={buildVm({ tentId: null })} />,
    );
    expect(
      screen.getByTestId("sensor-normalization-preview-empty-state").textContent,
    ).toMatch(/No write-ready metric rows/i);
  });

  it("does not render raw payload values or private fields", () => {
    const payload = {
      temperature_c: 24,
      humidity: 50,
      service_role: "leak-service-role",
      bridge_token: "leak-bridge-token",
      raw_payload: { secret: "leak-raw" },
    };
    const { container } = render(
      <SensorNormalizationPreviewPanel viewModel={buildVm({ payload })} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("leak-service-role");
    expect(text).not.toContain("leak-bridge-token");
    expect(text).not.toContain("leak-raw");
    expect(text).not.toContain("service_role");
    expect(text).not.toContain("bridge_token");
    expect(text).not.toMatch(/"secret"/);
  });

  it("renders prominent tent and plant status labels", () => {
    const vm = buildSensorNormalizationPreviewViewModel({
      payload: { temperature_c: 24, humidity: 50 },
      options: {
        source: "manual",
        sourceIdentity: "manual_entry",
        transport: "manual",
        tentId: TENT,
        plantId: null,
        capturedAt: FRESH,
        now: NOW,
      },
    });
    render(<SensorNormalizationPreviewPanel viewModel={vm} />);
    const tent = screen.getByTestId("sensor-normalization-preview-tent-status");
    expect(tent.getAttribute("data-tent-status")).toBe("linked_verified");
    expect(tent.textContent).toBe("Linked tent verified");
    const plant = screen.getByTestId("sensor-normalization-preview-plant-status");
    expect(plant.getAttribute("data-plant-status")).toBe("missing");
    expect(plant.textContent).toBe("No plant linked");
  });

  it("renders raw field count only — no raw payload keys leak", () => {
    const payload = {
      temperature_c: 24,
      humidity: 50,
      vendor_serial_abc: "leak-key-value",
    };
    const { container } = render(
      <SensorNormalizationPreviewPanel viewModel={buildVm({ payload })} />,
    );
    const note = screen.getByTestId("sensor-normalization-preview-raw-note");
    expect(note.textContent).toMatch(/Raw fields: 3/);
    const text = container.textContent ?? "";
    expect(text).not.toContain("vendor_serial_abc");
    expect(text).not.toContain("leak-key-value");
    expect(text).not.toMatch(/raw_payload/i);
  });

  it("compact variant hides long-form table but shows row-count summary", () => {
    render(
      <SensorNormalizationPreviewPanel viewModel={buildVm()} variant="compact" />,
    );
    expect(
      screen.queryByTestId("sensor-normalization-preview-long-form"),
    ).toBeNull();
    expect(
      screen.getByTestId("sensor-normalization-preview-long-form-summary").textContent,
    ).toMatch(/write-ready row/);
    // Still renders source/identity/transport/confidence/warnings/row count.
    const badges = screen.getAllByTestId("sensor-normalization-preview-badge");
    expect(badges.some((b) => (b.textContent ?? "").includes("Source: csv"))).toBe(true);
    expect(
      screen.getByTestId("sensor-normalization-preview-row-count").textContent,
    ).toMatch(/\d+/);
  });


  it("static safety: panel does not import write paths or call edges", () => {
    const src = readFileSync(
      resolve(__dirname, "../components/SensorNormalizationPreviewPanel.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/insertSensorReading/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.upload\(/);
    expect(src).not.toMatch(/supabase\.from\(["']sensor_readings["']\)/);
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/action_queue/);
    expect(src).not.toMatch(/alerts/);
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/bridge[_\s-]?token/i);
    expect(src).not.toMatch(/device[_-]?control/i);
    expect(src).not.toMatch(/automation/i);
  });
});
