/**
 * Plant Detail Doctor launch dialog — render coverage + static safety.
 * Presentation/routing polish only. No AI calls, writes, schema/RLS,
 * edge functions, storage, auth, automation, device/hardware control,
 * calendar/notification/email/reminder scheduling, service_role,
 * functions.invoke, or fake-live sensor data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const useRecentMock = vi.fn();
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: (id: string | null | undefined) => useRecentMock(id),
}));

const useTimelineMemoryMock = vi.fn();
vi.mock("@/hooks/useTimelineMemory", () => ({
  useTimelineMemory: (...args: unknown[]) => useTimelineMemoryMock(...args),
  TIMELINE_MEMORY_DEFAULT_LIMIT: 100,
}));

const logReadinessMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/hooks/useLogAiDoctorReadinessToDiary", () => ({
  useLogAiDoctorReadinessToDiary: () => ({
    log: logReadinessMock,
    logging: false,
  }),
}));

import PlantDetailDoctorLaunchDialog, {
  DOCTOR_LAUNCH_HELPER_LINES,
} from "@/components/PlantDetailDoctorLaunchDialog";
import type { PlantRecentActivityRow } from "@/lib/plantRecentActivityRules";

const ROOT = resolve(__dirname, "../..");
const COMPONENT = readFileSync(
  resolve(ROOT, "src/components/PlantDetailDoctorLaunchDialog.tsx"),
  "utf8",
);

const FORBIDDEN = [
  /service_role/,
  /supabase\.from\(/,
  /functions\.invoke\(/,
  /\.rpc\(/,
  /\.insert\(/,
  /\.update\(/,
  /\.delete\(/,
  /\.upsert\(/,
  /calendar_events/,
  /\bnotifications\b/i,
  /\bsendgrid\b/i,
  /\bmailgun\b/i,
  /\bresend\b/i,
  /\bautopilot\b/i,
  /\bauto[-\s]?(execute|run|control)\b/i,
];

const NOW = new Date("2026-06-01T12:00:00.000Z");
const FRESH = "2026-05-30T10:00:00.000Z";

function row(p: Partial<PlantRecentActivityRow> = {}): PlantRecentActivityRow {
  return {
    id: "row-1",
    eventType: "note",
    occurredAt: FRESH,
    occurredAtLabel: "May 30",
    notePreview: "Looking healthy",
    plantId: "p1",
    tentId: null,
    hasPhoto: false,
    hasSnapshot: false,
    snapshotAt: null,
    snapshotStale: false,
    snapshotSourceLabel: null,
    isManualEntry: false,
    warnings: [],
    hasHardwareReadings: false,
    hardwareReadingLines: [],
    ...p,
  };
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof PlantDetailDoctorLaunchDialog>> = {},
) {
  return render(
    <MemoryRouter>
      <PlantDetailDoctorLaunchDialog
        plantId="p1"
        stage="veg"
        hasPlantPhoto={false}
        now={NOW}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("<PlantDetailDoctorLaunchDialog />", () => {
  beforeEach(() => {
    useRecentMock.mockReset();
    useRecentMock.mockReturnValue({ data: [], isLoading: false });
    useTimelineMemoryMock.mockReset();
    useTimelineMemoryMock.mockReturnValue({ items: [] });
  });

  it("does not open the summary dialog until Ask Doctor is clicked (no AI on mount)", () => {
    renderDialog();
    expect(screen.queryByTestId("plant-detail-doctor-launch-dialog")).toBeNull();
    expect(screen.getByTestId("plant-detail-doctor-launch-trigger")).toBeInTheDocument();
  });

  it("opens the context summary instead of routing immediately", () => {
    renderDialog();
    fireEvent.click(screen.getByTestId("plant-detail-doctor-launch-trigger"));
    expect(screen.getByTestId("plant-detail-doctor-launch-dialog")).toBeInTheDocument();
    expect(screen.getByText("Doctor context summary")).toBeInTheDocument();
    expect(screen.getByText(DOCTOR_LAUNCH_HELPER_LINES[0])).toBeInTheDocument();
    expect(screen.getByText(DOCTOR_LAUNCH_HELPER_LINES[1])).toBeInTheDocument();
  });

  it("shows available/missing states in the summary", () => {
    renderDialog({ hasPlantPhoto: true });
    fireEvent.click(screen.getByTestId("plant-detail-doctor-launch-trigger"));
    expect(
      screen.getByTestId("plant-detail-doctor-launch-item-stage").getAttribute("data-state"),
    ).toBe("available");
    expect(
      screen.getByTestId("plant-detail-doctor-launch-item-photo").getAttribute("data-state"),
    ).toBe("available");
    expect(
      screen.getByTestId("plant-detail-doctor-launch-item-timeline").getAttribute("data-state"),
    ).toBe("missing");
    expect(
      screen
        .getByTestId("plant-detail-doctor-launch-item-watering_feeding")
        .getAttribute("data-state"),
    ).toBe("missing");
  });

  const passingTimelineItems = () => [
    { kind: "diary", key: "d1", occurredAt: FRESH, eventType: "watering", hasPhoto: false, note: null },
    { kind: "diary", key: "d2", occurredAt: FRESH, eventType: "note", hasPhoto: false, note: "ok" },
  ];

  it("Continue to AI Doctor routes safely with plant context", () => {
    useTimelineMemoryMock.mockReturnValue({ items: passingTimelineItems() });
    renderDialog();
    fireEvent.click(screen.getByTestId("plant-detail-doctor-launch-trigger"));
    const cont = screen.getByTestId("plant-detail-doctor-launch-continue");
    expect(cont.getAttribute("href")).toBe("/doctor?plantId=p1");
  });

  it("encodes special characters in the plant id for the route param", () => {
    useTimelineMemoryMock.mockReturnValue({ items: passingTimelineItems() });
    renderDialog({ plantId: "p 1/2" });
    fireEvent.click(screen.getByTestId("plant-detail-doctor-launch-trigger"));
    const cont = screen.getByTestId("plant-detail-doctor-launch-continue");
    expect(cont.getAttribute("href")).toBe("/doctor?plantId=p%201%2F2");
  });

  it("Add context first dispatches the existing QuickLog event and closes the dialog", () => {
    const listener = vi.fn();
    window.addEventListener("verdant:open-quicklog", listener);
    renderDialog();
    fireEvent.click(screen.getByTestId("plant-detail-doctor-launch-trigger"));
    act(() => {
      fireEvent.click(screen.getByTestId("plant-detail-doctor-launch-add-context"));
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("plant-detail-doctor-launch-dialog")).toBeNull();
    window.removeEventListener("verdant:open-quicklog", listener);
  });

  it("Escape closes the dialog", () => {
    renderDialog();
    fireEvent.click(screen.getByTestId("plant-detail-doctor-launch-trigger"));
    expect(screen.getByTestId("plant-detail-doctor-launch-dialog")).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    });
    expect(screen.queryByTestId("plant-detail-doctor-launch-dialog")).toBeNull();
  });

  it("renders nothing without a plantId", () => {
    const { container } = renderDialog({ plantId: null });
    expect(container.firstChild).toBeNull();
  });

  it("copy does not promise certainty or imply automation/hardware control", () => {
    renderDialog();
    fireEvent.click(screen.getByTestId("plant-detail-doctor-launch-trigger"));
    const dialog = screen.getByTestId("plant-detail-doctor-launch-dialog");
    const text = dialog.textContent ?? "";
    expect(text).not.toMatch(/guarantee|certain|definitely|will fix|auto[-\s]?run|autopilot/i);
    expect(text).not.toMatch(/control (fan|light|pump|heater|humidifier|dehumidifier)/i);
  });

  it("does not leak IDs, tokens, raw payloads, storage paths, or provenance markers", () => {
    useRecentMock.mockReturnValue({
      data: [
        row({
          id: "secret-id-xyz",
          plantId: "plant-secret",
          tentId: "tent-secret",
          snapshotSourceLabel: "raw-payload-token-abc",
          hasSnapshot: true,
          snapshotAt: FRESH,
        }),
      ],
      isLoading: false,
    });
    renderDialog();
    fireEvent.click(screen.getByTestId("plant-detail-doctor-launch-trigger"));
    const dialog = screen.getByTestId("plant-detail-doctor-launch-dialog");
    const text = dialog.textContent ?? "";
    expect(text).not.toMatch(/secret-id-xyz/);
    expect(text).not.toMatch(/plant-secret/);
    expect(text).not.toMatch(/tent-secret/);
    expect(text).not.toMatch(/raw-payload/);
  });

  it("gate blocks Continue when readiness is insufficient (no timeline activity or snapshots)", () => {
    // Default beforeEach seeds empty timeline items → insufficient readiness.
    renderDialog();
    fireEvent.click(screen.getByTestId("plant-detail-doctor-launch-trigger"));
    // The enabled Link Continue is replaced by a disabled button.
    expect(screen.queryByTestId("plant-detail-doctor-launch-continue")).toBeNull();
    const blocked = screen.getByTestId("plant-detail-doctor-launch-continue-blocked");
    expect(blocked).toBeDisabled();
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    const notice = screen.getByTestId("plant-detail-doctor-launch-readiness-notice");
    expect(notice.getAttribute("data-readiness")).toBe("insufficient");
    expect(notice.textContent).toMatch(/More context needed/);
  });

  it("shows a blocked explanation naming the missing categories and the exact next button", () => {
    // Default beforeEach → empty timeline → insufficient readiness.
    renderDialog();
    fireEvent.click(screen.getByTestId("plant-detail-doctor-launch-trigger"));
    const explanation = screen.getByTestId(
      "plant-detail-doctor-launch-blocked-explanation",
    );
    const sentence = screen.getByTestId("plant-detail-doctor-launch-blocked-sentence");
    // Explicitly names the missing categories that block diagnosis.
    expect(sentence.textContent).toMatch(/recent note, watering, feeding, or photo/);
    expect(sentence.textContent).toMatch(/recent manual sensor snapshot/);
    // Explicitly names the exact button to press next.
    const addBtn = screen.getByTestId("plant-detail-doctor-launch-add-context");
    const label = addBtn.textContent?.trim() ?? "";
    expect(sentence.textContent).toContain(`Tap "${label}"`);
    // The list surfaces the blocking codes deterministically.
    const list = screen.getByTestId("plant-detail-doctor-launch-blocked-list");
    const codes = Array.from(list.querySelectorAll("li")).map((li) =>
      li.getAttribute("data-blocking-code"),
    );
    expect(codes).toEqual([
      "recent-timeline-activity",
      "recent-manual-sensor-snapshot",
    ]);
    expect(explanation.getAttribute("role")).toBe("status");
  });

  it("gate allows Continue when readiness reaches partial (existing route behavior preserved, no blocked explanation)", () => {
    useTimelineMemoryMock.mockReturnValue({ items: passingTimelineItems() });
    renderDialog();
    fireEvent.click(screen.getByTestId("plant-detail-doctor-launch-trigger"));
    expect(screen.queryByTestId("plant-detail-doctor-launch-continue-blocked")).toBeNull();
    expect(
      screen.queryByTestId("plant-detail-doctor-launch-blocked-explanation"),
    ).toBeNull();
    const cont = screen.getByTestId("plant-detail-doctor-launch-continue");
    expect(cont.getAttribute("href")).toBe("/doctor?plantId=p1");
    const notice = screen.getByTestId("plant-detail-doctor-launch-readiness-notice");
    expect(["partial", "strong"]).toContain(notice.getAttribute("data-readiness"));
  });
});

describe("Doctor launch dialog — static safety", () => {
  it("component avoids forbidden side-effect/security patterns", () => {
    for (const pat of FORBIDDEN) {
      expect(COMPONENT, `component matched ${pat}`).not.toMatch(pat);
    }
  });

  it("component does not import AI gateway or model SDKs", () => {
    expect(COMPONENT).not.toMatch(/ai-gateway/);
    expect(COMPONENT).not.toMatch(/openai|anthropic|gemini/i);
  });
});
