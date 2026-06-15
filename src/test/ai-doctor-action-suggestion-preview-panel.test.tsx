/**
 * Render test for the Action Queue suggestion preview embedded inside
 * AiDoctorContextReadinessPanel. Preview-only: must never render
 * approved/queued/executed copy.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AiDoctorContextReadinessPanel from "@/components/AiDoctorContextReadinessPanel";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in preview render test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in preview render test");
      },
    },
  },
}));

vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
  throw new Error("fetch not allowed in preview render test");
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

function getPreview() {
  return screen.getByTestId("ai-doctor-action-suggestion-preview");
}

describe("AiDoctorContextReadinessPanel — Action Queue suggestion preview", () => {
  it("renders the preview card with label and approval-required safety notes", () => {
    const context = ctx(
      [{ occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" }],
      [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
        { metric: "humidity_pct", value: 55, captured_at: ago(HOUR), source: "live" },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    const card = getPreview();
    expect(card.textContent).toContain("Action Queue suggestion preview");
    const notes = screen.getByTestId(
      "ai-doctor-action-suggestion-preview-safety-notes",
    );
    expect(notes.textContent).toMatch(/approval required/i);
    expect(notes.textContent).toMatch(/no device control/i);
    expect(notes.textContent).toMatch(/preview only/i);
  });

  it("shows eligible status when current live readings + plant context are present", () => {
    const context = ctx(
      [{ occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" }],
      [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
        { metric: "humidity_pct", value: 55, captured_at: ago(HOUR), source: "live" },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    const card = getPreview();
    expect(card.getAttribute("data-status")).toBe("eligible");
    expect(card.getAttribute("data-eligible")).toBe("true");
    expect(
      screen.getByTestId("ai-doctor-action-suggestion-preview-action").textContent,
    ).toMatch(/current sensor snapshot|monitor for 24 hours/i);
  });

  it("shows needs_current_reading when only CSV imported history is available", () => {
    const context = ctx(
      [{ occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" }],
      [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "csv" },
        { metric: "humidity_pct", value: 55, captured_at: ago(2 * HOUR), source: "csv" },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    const card = getPreview();
    expect(card.getAttribute("data-status")).toBe("needs_current_reading");
    expect(card.getAttribute("data-eligible")).toBe("false");
  });

  it("never renders approved/queued/executed language in the preview card", () => {
    const context = ctx(
      [{ occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" }],
      [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    const text = getPreview().textContent ?? "";
    expect(text).not.toMatch(/\bapproved\b/i);
    expect(text).not.toMatch(/\bqueued\b/i);
    expect(text).not.toMatch(/\bexecuted?\b/i);
    expect(text).not.toMatch(/turn on|turn off|setpoint|actuate|dose/i);
  });
});
