/**
 * Render tests for AiDoctorCheckInPreviewPanel.
 *
 * Verifies the CTA renders, opening the dialog shows the deterministic
 * preview with the required notices, and no Supabase / fetch / model
 * calls happen.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AiDoctorCheckInPreviewPanel from "@/components/AiDoctorCheckInPreviewPanel";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in preview panel render test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in preview panel render test");
      },
    },
  },
}));

const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
  throw new Error("fetch not allowed in preview panel render test");
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

function openPreview() {
  const button = screen.getByTestId("ai-doctor-check-in-preview-button");
  fireEvent.click(button);
}

describe("AiDoctorCheckInPreviewPanel", () => {
  it("renders the 'Preview AI Doctor Check-In' button when context exists", () => {
    const context = ctx(
      [{ occurred_at: ago(HOUR), event_type: "watering", source: "manual" }],
      [{ metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" }],
    );
    render(<AiDoctorCheckInPreviewPanel context={context} />);
    const btn = screen.getByTestId("ai-doctor-check-in-preview-button");
    expect(btn.textContent).toContain("Preview AI Doctor Check-In");
  });

  it("clicking the button shows the deterministic preview with both notices", () => {
    const context = ctx(
      [{ occurred_at: ago(HOUR), event_type: "watering", source: "manual" }],
      [{ metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" }],
    );
    render(<AiDoctorCheckInPreviewPanel context={context} />);
    openPreview();
    expect(
      screen.getByTestId("ai-doctor-check-in-preview-notice").textContent,
    ).toBe("Preview only — not saved.");
    expect(
      screen.getByTestId("ai-doctor-check-in-preview-no-model-notice").textContent,
    ).toBe("No live AI model was called.");
    expect(screen.getByTestId("ai-doctor-check-in-preview-summary")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-check-in-preview-immediate")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-check-in-preview-24h")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-check-in-preview-3d")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("weak context preview surfaces missing information and low confidence", () => {
    const context = ctx([], []);
    render(<AiDoctorCheckInPreviewPanel context={context} />);
    openPreview();
    expect(
      screen.getByTestId("ai-doctor-check-in-preview-body").getAttribute("data-context-weak"),
    ).toBe("true");
    expect(
      screen.getByTestId("ai-doctor-check-in-preview-confidence").textContent,
    ).toContain("low");
    expect(screen.getByTestId("ai-doctor-check-in-preview-missing")).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-check-in-preview-limitation-no_sensors"),
    ).toBeTruthy();
  });

  it("labels demo-only telemetry as a demo-only limitation, not live", () => {
    const context = ctx(
      [],
      [{ metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "demo" }],
    );
    render(<AiDoctorCheckInPreviewPanel context={context} />);
    openPreview();
    expect(
      screen.getByTestId("ai-doctor-check-in-preview-limitation-demo_only"),
    ).toBeTruthy();
  });

  it("flags stale/invalid telemetry as a limitation in the preview", () => {
    const context = ctx(
      [],
      [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live", quality: "stale" },
      ],
    );
    render(<AiDoctorCheckInPreviewPanel context={context} />);
    openPreview();
    expect(
      screen.getByTestId("ai-doctor-check-in-preview-limitation-stale_or_invalid"),
    ).toBeTruthy();
  });

  it("static guard: panel source has no write/model/API imports", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "src/components/AiDoctorCheckInPreviewPanel.tsx",
      "utf8",
    );
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).not.toMatch(/functions\s*\.\s*invoke/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/actionQueue/i);
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/createAlert|insertAlert/);
    expect(src).not.toMatch(/openai|anthropic|gemini|model\.invoke/i);
  });
});
