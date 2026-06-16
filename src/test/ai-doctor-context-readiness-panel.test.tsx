/**
 * Render tests for AiDoctorContextReadinessPanel.
 *
 * Verifies state-correct rendering, source labels, limitations, and
 * "Preview only — not saved." labeling. Confirms no Supabase / network
 * calls happen during render.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AiDoctorContextReadinessPanel from "@/components/AiDoctorContextReadinessPanel";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in readiness panel render test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in readiness panel render test");
      },
    },
  },
}));

const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
  throw new Error("fetch not allowed in readiness panel render test");
}) as never);

const NOW = new Date("2026-06-10T12:00:00Z");
const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const plant = {
  id: "p1",
  name: "Plant A",
  strain: "Northern Lights",
  stage: "veg" as const,
  grow_id: "g1",
  tent_id: "t1",
};

function ctx(
  growEvents: ReadonlyArray<Record<string, unknown>>,
  sensorReadings: ReadonlyArray<Record<string, unknown>>,
) {
  return compileAiDoctorContextFromRows({
    plant,
    growEvents,
    sensorReadings,
    now: NOW,
  });
}

describe("AiDoctorContextReadinessPanel", () => {
  it("renders 'Ready for cautious check-in' when context is strong", () => {
    const context = ctx(
      [{ occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" }],
      [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
        { metric: "humidity_pct", value: 55, captured_at: ago(HOUR), source: "live" },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} openAlertsCount={2} />);
    const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
    expect(panel.getAttribute("data-readiness-state")).toBe("ready");
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-state-badge").textContent,
    ).toContain("Ready for cautious check-in");
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-count-open-alerts").textContent,
    ).toBe("2");
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-source-live"),
    ).toBeTruthy();
  });

  it("renders 'Sensor data missing' when no sensor readings exist", () => {
    const context = ctx([], []);
    render(<AiDoctorContextReadinessPanel context={context} />);
    const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
    expect(panel.getAttribute("data-readiness-state")).toBe("sensor_missing");
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-state-badge").textContent,
    ).toContain("Sensor data missing");
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-limitation-no_sensors"),
    ).toBeTruthy();
  });

  it("renders stale/invalid telemetry as a limitation, not as healthy", () => {
    const context = ctx(
      [],
      [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live", quality: "stale" },
        { metric: "humidity_pct", value: 55, captured_at: ago(HOUR), source: "live", quality: "invalid" },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
    expect(panel.getAttribute("data-readiness-state")).toBe("telemetry_limited");
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-limitation-stale_or_invalid"),
    ).toBeTruthy();
    const stale = screen.getByTestId("ai-doctor-context-readiness-panel-source-stale");
    expect(stale.getAttribute("data-trustworthy")).toBe("false");
  });

  it("renders demo-only data as 'Demo data only'", () => {
    const context = ctx(
      [],
      [{ metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "demo" }],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
    expect(panel.getAttribute("data-readiness-state")).toBe("demo_only");
    const demo = screen.getByTestId("ai-doctor-context-readiness-panel-source-demo");
    expect(demo.textContent).toContain("Demo");
    expect(demo.getAttribute("data-trustworthy")).toBe("false");
    // Never rendered as live
    expect(
      screen.queryByTestId("ai-doctor-context-readiness-panel-source-live"),
    ).toBeNull();
  });

  it("renders manual and CSV source labels correctly", () => {
    const context = ctx(
      [],
      [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "manual" },
        { metric: "humidity_pct", value: 55, captured_at: ago(2 * HOUR), source: "csv" },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-source-manual").textContent,
    ).toContain("Manual");
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-source-csv").textContent,
    ).toContain("CSV / imported");
  });

  it("renders preview labeled 'Preview only — not saved.'", () => {
    const context = ctx(
      [],
      [{ metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" }],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-preview-notice").textContent,
    ).toBe("Preview only — not saved.");
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-preview"),
    ).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows imported history disclosure when CSV readings are present", () => {
    const context = ctx(
      [],
      [
        {
          metric: "temperature_c",
          value: 24,
          captured_at: ago(2 * HOUR),
          source: "csv",
          raw_payload: { source_app: "spider_farmer" },
        },
        {
          metric: "humidity_pct",
          value: 55,
          captured_at: ago(HOUR),
          source: "csv",
          raw_payload: { source_app: "spider_farmer" },
        },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    expect(
      screen.getByTestId("ai-doctor-imported-history-disclosure"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-imported-history-source-label").textContent,
    ).toContain("CSV history");
    expect(
      screen.getByTestId("ai-doctor-imported-history-vendors").textContent,
    ).toContain("Spider Farmer");
    expect(
      screen.getByTestId("ai-doctor-imported-history-total-readings").textContent,
    ).toBe("2");
  });

  it("hides imported history disclosure when no CSV readings exist", () => {
    const context = ctx(
      [],
      [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
        { metric: "humidity_pct", value: 55, captured_at: ago(2 * HOUR), source: "manual" },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    expect(
      screen.queryByTestId("ai-doctor-imported-history-disclosure"),
    ).toBeNull();
  });

  it("shows missing-live warning when no live readings are present", () => {
    const context = ctx(
      [],
      [
        {
          metric: "temperature_c",
          value: 24,
          captured_at: ago(HOUR),
          source: "csv",
        },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    expect(
      screen.getByTestId("ai-doctor-imported-history-missing-live-warning"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-imported-history-missing-live-warning").textContent,
    ).toMatch(/Missing current live\/manual readings/i);
  });

  it("does not show missing-live warning when live readings are present", () => {
    const context = ctx(
      [],
      [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
        {
          metric: "humidity_pct",
          value: 55,
          captured_at: ago(2 * HOUR),
          source: "csv",
        },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    expect(
      screen.queryByTestId("ai-doctor-imported-history-missing-live-warning"),
    ).toBeNull();
  });

  it("never renders raw payload or private fields in imported history disclosure", () => {
    const context = ctx(
      [],
      [
        {
          metric: "temperature_c",
          value: 24,
          captured_at: ago(HOUR),
          source: "csv",
          raw_payload: {
            source_app: "spider_farmer",
            device_serial: "SF-SECRET-123",
            bridge_token: "btoken_xyz",
            file_name: "secret.csv",
            batch_id: "batch-42",
            internal_id: "int-99",
            cell_value: "A1",
          },
        },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    const disclosure = screen.getByTestId("ai-doctor-imported-history-disclosure");
    const text = disclosure.textContent ?? "";
    expect(text).not.toContain("SF-SECRET-123");
    expect(text).not.toContain("btoken_xyz");
    expect(text).not.toContain("secret.csv");
    expect(text).not.toContain("batch-42");
    expect(text).not.toContain("int-99");
    expect(text).not.toContain("A1");
    expect(text).not.toContain("raw_payload");
    expect(text).not.toContain("raw_row");
  });

  it("static guard: panel source imports no Supabase/action-queue/write helpers", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "src/components/AiDoctorContextReadinessPanel.tsx",
      "utf8",
    );
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).not.toMatch(/functions\s*\.\s*invoke/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    // Disallow Action Queue write helper identifiers (camelCase code refs),
    // not human-readable "Action Queue" copy or test-id strings.
    expect(src).not.toMatch(/useAddAiDoctorSessionSuggestionToActionQueue/);
    expect(src).not.toMatch(/buildActionQueueDraftFromAiDoctorSession/);
    expect(src).not.toMatch(/AiDoctorSessionActionQueueButton/);
    expect(src).not.toMatch(/from\(["'`]action_queue["'`]\)/);
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    // No alert-creation helpers
    expect(src).not.toMatch(/createAlert|insertAlert/);
  });
});
