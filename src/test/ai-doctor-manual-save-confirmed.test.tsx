/**
 * Integration tests for confirmed AI Doctor manual save.
 *
 * Mocks the existing safe Quick Log v2 save hook and verifies:
 *  - One call per confirm.
 *  - Correct payload (event_type, source, safety labels, redacted engine output,
 *    idempotency key).
 *  - Success / duplicate / failure messaging.
 *  - No alerts / Action Queue / model writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AiDoctorCheckInPreviewPanel from "@/components/AiDoctorCheckInPreviewPanel";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";

const saveMock = vi.fn();

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: saveMock, saving: false, error: null }),
}));

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
  overrides: {
    plantOverride?: typeof plant;
    events?: ReadonlyArray<Record<string, unknown>>;
    sensors?: ReadonlyArray<Record<string, unknown>>;
  } = {},
) {
  return compileAiDoctorContextFromRows({
    plant: overrides.plantOverride ?? plant,
    growEvents:
      overrides.events ??
      [{ occurred_at: ago(HOUR), event_type: "watering", source: "manual" }],
    sensorReadings:
      overrides.sensors ??
      [
        {
          metric: "temperature_c",
          value: 24,
          captured_at: ago(HOUR),
          source: "live",
        },
      ],
    now: NOW,
  });
}

function openSaveAndConfirm() {
  fireEvent.click(screen.getByTestId("ai-doctor-check-in-preview-button"));
  fireEvent.click(screen.getByTestId("ai-doctor-manual-save-open-button"));
  fireEvent.click(screen.getByTestId("ai-doctor-manual-save-confirm-button"));
}

describe("AiDoctorCheckInPreviewPanel — confirmed manual save", () => {
  beforeEach(() => {
    saveMock.mockReset();
  });

  it("calls the Quick Log v2 save hook exactly once with a valid AI Doctor payload", async () => {
    saveMock.mockResolvedValueOnce({ ok: true, growEventId: "ge-1" });
    render(<AiDoctorCheckInPreviewPanel context={ctx()} />);
    openSaveAndConfirm();
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0][0];
    expect(payload.p_target_type).toBe("plant");
    expect(payload.p_target_id).toBe("p1");
    expect(payload.p_action).toBe("note");
    expect(payload.p_note).toMatch(/AI Doctor/i);
    const d = payload.p_details;
    expect(d.kind).toBe("ai_doctor_check_in");
    expect(d.source).toBe("ai_doctor_check_in_manual_save");
    expect(d.event_type_intent).toBe("observation");
    expect(d.preview_only).toBe(true);
    expect(d.manual_save).toBe(true);
    expect(d.deterministic_engine).toBe(true);
    expect(d.no_live_ai_model).toBe(true);
    expect(typeof d.idempotency_key).toBe("string");
    expect(d.idempotency_key).toMatch(/^aidoc:p1:/);
    // engine_output is redacted
    expect(d.engine_output).toBeTruthy();
    expect(JSON.stringify(payload)).not.toMatch(/raw_payload|secret|token/i);
  });

  it("shows 'Saved to diary.' on success", async () => {
    saveMock.mockResolvedValueOnce({ ok: true, growEventId: "ge-1" });
    render(<AiDoctorCheckInPreviewPanel context={ctx()} />);
    openSaveAndConfirm();
    await waitFor(() =>
      expect(
        screen.getByTestId("ai-doctor-manual-save-success").textContent,
      ).toMatch(/Saved to diary\./),
    );
  });

  it("shows 'Already saved to diary.' on duplicate response", async () => {
    saveMock.mockResolvedValueOnce({ ok: false, reason: "duplicate" });
    render(<AiDoctorCheckInPreviewPanel context={ctx()} />);
    openSaveAndConfirm();
    await waitFor(() =>
      expect(
        screen.getByTestId("ai-doctor-manual-save-duplicate").textContent,
      ).toMatch(/Already saved to diary\./),
    );
  });

  it("shows safe failure message on save failure and only one save call", async () => {
    saveMock.mockResolvedValueOnce({ ok: false, reason: "save_failed" });
    render(<AiDoctorCheckInPreviewPanel context={ctx()} />);
    openSaveAndConfirm();
    await waitFor(() =>
      expect(
        screen.getByTestId("ai-doctor-manual-save-error").textContent,
      ).toMatch(/Could not save AI Doctor check-in\. Nothing else was changed\./),
    );
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("blocks save and does not call hook when draft is blocked", async () => {
    const blockedPlant = {
      ...plant,
      id: "",
      grow_id: null as unknown as string,
      tent_id: null as unknown as string,
    };
    render(
      <AiDoctorCheckInPreviewPanel context={ctx({ plantOverride: blockedPlant })} />,
    );
    fireEvent.click(screen.getByTestId("ai-doctor-check-in-preview-button"));
    fireEvent.click(screen.getByTestId("ai-doctor-manual-save-open-button"));
    expect(screen.getByTestId("ai-doctor-manual-save-blocked")).toBeTruthy();
    expect(
      screen.queryByTestId("ai-doctor-manual-save-confirm-button"),
    ).toBeNull();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("copy receipt button still renders alongside save button", () => {
    render(<AiDoctorCheckInPreviewPanel context={ctx()} />);
    fireEvent.click(screen.getByTestId("ai-doctor-check-in-preview-button"));
    expect(screen.getByTestId("ai-doctor-check-in-copy-button")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-manual-save-open-button")).toBeTruthy();
  });
});
