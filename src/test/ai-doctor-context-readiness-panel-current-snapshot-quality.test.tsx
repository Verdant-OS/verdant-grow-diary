/**
 * Integration tests for the Manual Sensor Snapshot quality badge inside
 * the AI Doctor Context Readiness panel.
 *
 * Presenter-only. Verifies that the badge reflects current/manual/live
 * snapshot quality, that CSV history is kept separate from current
 * context, and that no raw payload / private fields leak into the DOM.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import AiDoctorContextReadinessPanel from "@/components/AiDoctorContextReadinessPanel";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in this test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in this test");
      },
    },
  },
}));

const NOW = new Date("2026-06-15T12:00:00Z");
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

function ctx(sensorReadings: ReadonlyArray<Record<string, unknown>>) {
  return compileAiDoctorContextFromRows({
    plant,
    growEvents: [
      { occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" },
    ],
    sensorReadings,
    now: NOW,
  });
}

describe("AiDoctorContextReadinessPanel — current snapshot quality badge", () => {
  it("shows Usable current reading with Source: manual for a fresh manual snapshot", () => {
    const context = ctx([
      { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "manual" },
      { metric: "humidity_pct", value: 55, captured_at: ago(HOUR), source: "manual" },
    ]);
    render(<AiDoctorContextReadinessPanel context={context} />);
    const region = screen.getByTestId(
      "ai-doctor-context-readiness-panel-current-snapshot-quality",
    );
    const quality = within(region).getByTestId("manual-snapshot-quality");
    expect(quality.getAttribute("data-quality")).toBe("usable");
    expect(within(region).getByText("Usable current reading")).toBeInTheDocument();
    expect(within(region).getAllByText(/Source: manual/i).length).toBeGreaterThan(0);
  });

  it("flags Invalid reading when current humidity is stuck at 100%", () => {
    const context = ctx([
      { metric: "humidity_pct", value: 100, captured_at: ago(HOUR), source: "manual" },
      { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "manual" },
    ]);
    render(<AiDoctorContextReadinessPanel context={context} />);
    const region = screen.getByTestId(
      "ai-doctor-context-readiness-panel-current-snapshot-quality",
    );
    const quality = within(region).getByTestId("manual-snapshot-quality");
    expect(quality.getAttribute("data-quality")).toBe("invalid");
    expect(within(region).getByText("Invalid reading")).toBeInTheDocument();
  });

  it("keeps CSV-only history as Needs review / history-only, not current usable context", () => {
    const context = ctx([
      { metric: "temperature_c", value: 24, captured_at: ago(2 * HOUR), source: "csv" },
      { metric: "humidity_pct", value: 55, captured_at: ago(2 * HOUR), source: "csv" },
    ]);
    render(<AiDoctorContextReadinessPanel context={context} />);
    const region = screen.getByTestId(
      "ai-doctor-context-readiness-panel-current-snapshot-quality",
    );
    const quality = within(region).getByTestId("manual-snapshot-quality");
    expect(quality.getAttribute("data-quality")).toBe("needs_review");
    expect(within(region).getByText("Needs review")).toBeInTheDocument();
    expect(within(region).getByText(/CSV history only/i)).toBeInTheDocument();

    // Action Queue suggestion preview must remain needs_current_reading.
    const preview = screen.getByTestId("ai-doctor-action-suggestion-preview");
    expect(preview.getAttribute("data-status")).toBe("needs_current_reading");
    expect(preview.getAttribute("data-eligible")).toBe("false");
  });

  it("shows Missing current reading when no sensor groups exist", () => {
    const context = ctx([]);
    render(<AiDoctorContextReadinessPanel context={context} />);
    const region = screen.getByTestId(
      "ai-doctor-context-readiness-panel-current-snapshot-quality",
    );
    const quality = within(region).getByTestId("manual-snapshot-quality");
    expect(quality.getAttribute("data-quality")).toBe("missing");
    expect(within(region).getByText("Missing current reading")).toBeInTheDocument();
  });

  it("never renders raw payload or private field markers", () => {
    const context = ctx([
      { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "manual" },
    ]);
    const { container } = render(
      <AiDoctorContextReadinessPanel context={context} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/raw_payload/i);
    expect(text).not.toMatch(/service_role/i);
    expect(text).not.toMatch(/token|secret|api[_-]?key/i);
  });
});
