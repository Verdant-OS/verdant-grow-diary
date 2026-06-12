/**
 * Render tests for the AI Doctor Manual Save confirmation UI shell
 * inside AiDoctorCheckInPreviewPanel.
 *
 * Hard rule: no Supabase, no fetch, no model calls, no writes.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AiDoctorCheckInPreviewPanel from "@/components/AiDoctorCheckInPreviewPanel";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed");
      },
    },
    rpc: () => {
      throw new Error("rpc not allowed");
    },
  },
}));

vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
  throw new Error("fetch not allowed");
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
  overrides: { plantOverride?: typeof plant; events?: ReadonlyArray<Record<string, unknown>>; sensors?: ReadonlyArray<Record<string, unknown>> } = {},
) {
  return compileAiDoctorContextFromRows({
    plant: overrides.plantOverride ?? plant,
    growEvents:
      overrides.events ??
      [{ occurred_at: ago(HOUR), event_type: "watering", source: "manual" }],
    sensorReadings:
      overrides.sensors ??
      [{ metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" }],
    now: NOW,
  });
}

function openPreview() {
  fireEvent.click(screen.getByTestId("ai-doctor-check-in-preview-button"));
}

function openSaveConfirm() {
  fireEvent.click(screen.getByTestId("ai-doctor-manual-save-open-button"));
}

describe("AiDoctorCheckInPreviewPanel — manual save confirmation shell", () => {
  it("renders Save preview to diary button in the preview dialog", () => {
    render(<AiDoctorCheckInPreviewPanel context={ctx()} />);
    openPreview();
    const btn = screen.getByTestId("ai-doctor-manual-save-open-button");
    expect(btn).toBeTruthy();
    expect(btn.textContent).toMatch(/Save preview to diary/);
  });

  it("opens the confirmation dialog on click", () => {
    render(<AiDoctorCheckInPreviewPanel context={ctx()} />);
    openPreview();
    openSaveConfirm();
    expect(
      screen.getByTestId("ai-doctor-manual-save-confirmation-dialog"),
    ).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-manual-save-ready")).toBeTruthy();
  });

  it("shows event type, source, safety labels", () => {
    render(<AiDoctorCheckInPreviewPanel context={ctx()} />);
    openPreview();
    openSaveConfirm();
    expect(
      screen.getByTestId("ai-doctor-manual-save-event-type").textContent,
    ).toBe("Observation");
    expect(
      screen.getByTestId("ai-doctor-manual-save-source").textContent,
    ).toBe("AI Doctor check-in manual save");
    expect(
      screen.getByTestId("ai-doctor-manual-save-safety-labels"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-manual-save-safety-preview-only"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-manual-save-safety-no-live-ai-model"),
    ).toBeTruthy();
  });

  it("renders mandatory copy lines about no AI model and no alerts", () => {
    render(<AiDoctorCheckInPreviewPanel context={ctx()} />);
    openPreview();
    openSaveConfirm();
    expect(
      screen.getByTestId("ai-doctor-manual-save-copy-no-model").textContent,
    ).toMatch(/No live AI model was called\./);
    expect(
      screen.getByTestId("ai-doctor-manual-save-copy-no-alerts").textContent,
    ).toMatch(/No alerts or Action Queue items will be created\./);
    expect(
      screen.getByTestId("ai-doctor-manual-save-copy-cancel").textContent,
    ).toMatch(/cancel before anything is saved/i);
  });

  it("shows limitations when present", () => {
    render(
      <AiDoctorCheckInPreviewPanel
        context={ctx({
          sensors: [
            {
              metric: "temperature_c",
              value: 24,
              captured_at: ago(HOUR),
              source: "demo",
            },
          ],
        })}
      />,
    );
    openPreview();
    openSaveConfirm();
    expect(
      screen.getByTestId("ai-doctor-manual-save-limitations"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-manual-save-limitation-demo_only"),
    ).toBeTruthy();
  });

  it("confirm button is enabled with 'Save to diary' label when draft is ready", () => {
    render(<AiDoctorCheckInPreviewPanel context={ctx()} />);
    openPreview();
    openSaveConfirm();
    const confirm = screen.getByTestId(
      "ai-doctor-manual-save-confirm-button",
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    expect(confirm.textContent).toMatch(/Save to diary/);
  });

  it("blocked draft shows reasons and no enabled save UI", () => {
    const blockedPlant = {
      ...plant,
      id: "",
      grow_id: null as unknown as string,
      tent_id: null as unknown as string,
    };
    render(
      <AiDoctorCheckInPreviewPanel
        context={ctx({ plantOverride: blockedPlant })}
      />,
    );
    openPreview();
    openSaveConfirm();
    expect(screen.getByTestId("ai-doctor-manual-save-blocked")).toBeTruthy();
    expect(
      screen.queryByTestId("ai-doctor-manual-save-confirm-button"),
    ).toBeNull();
    expect(
      screen.getByTestId("ai-doctor-manual-save-blocked-reasons"),
    ).toBeTruthy();
  });

  it("copy receipt button still renders alongside save button", () => {
    render(<AiDoctorCheckInPreviewPanel context={ctx()} />);
    openPreview();
    expect(screen.getByTestId("ai-doctor-check-in-copy-button")).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-manual-save-open-button"),
    ).toBeTruthy();
  });

  it("static guard: panel source has no Supabase/write/model imports", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "src/components/AiDoctorCheckInPreviewPanel.tsx",
      "utf8",
    );
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/functions\s*\.\s*invoke/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/useQuickLogV2Save|useMutation/);
    expect(src).not.toMatch(/createAlert|insertAlert|alertMutation/i);
    expect(src).not.toMatch(/actionQueue(Writer|Insert|Create|Mutation|Append)/i);
    expect(src).not.toMatch(/openai|anthropic|gemini|model\.invoke/i);
  });
});
