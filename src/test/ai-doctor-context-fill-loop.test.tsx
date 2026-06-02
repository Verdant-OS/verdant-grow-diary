/**
 * AI Doctor Context fill-loop regression tests.
 *
 * Proves the quick-action loop end-to-end at the rules / view-model
 * boundary: a missing-context code is present before, and removed after,
 * the matching context (manual snapshot, recent log, photo) exists
 * within the shared readiness window.
 *
 * Hard constraints (matches existing static safety scans):
 *  - No model/API calls, no Supabase writes, no AI Doctor session
 *    creation, no alerts, no action_queue, no sensor_readings writes.
 *  - Uses the shared 7d/48h constants — never re-implements window math.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import {
  evaluateAiDoctorContext,
  AI_DOCTOR_RECENT_WINDOW_MS,
  AI_DOCTOR_SNAPSHOT_FRESH_MS,
  type AiDoctorContextEventInput,
  type AiDoctorContextManualSnapshotInput,
  type AiDoctorContextPlantInput,
} from "@/lib/aiDoctorContextRules";
import {
  AI_DOCTOR_CONTEXT_READINESS_CONFIG,
  AI_DOCTOR_RECENT_EVENT_WINDOW_DAYS,
  AI_DOCTOR_SNAPSHOT_FRESH_HOURS,
} from "@/constants/aiDoctorContextReadiness";
import CoachAiDoctorContextPanel, {
  COACH_AI_DOCTOR_CONTEXT_AMBIGUOUS_COPY,
} from "@/components/CoachAiDoctorContextPanel";

// Keep Supabase out of these tests entirely.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: () => {
        throw new Error("DB write not allowed in fill-loop regression tests");
      },
      select: () => ({ eq: () => ({ data: [], error: null }) }),
    }),
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in fill-loop tests");
      },
    },
  },
}));

const NOW = Date.parse("2026-01-15T12:00:00.000Z");
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const plant = (over: Partial<AiDoctorContextPlantInput> = {}): AiDoctorContextPlantInput => ({
  hasProfile: true,
  strain: "Northern Lights Auto",
  stage: "veg",
  medium: "soil",
  hasPlantPhoto: false,
  ...over,
});

const ev = (
  daysAgo: number,
  category: AiDoctorContextEventInput["category"],
): AiDoctorContextEventInput => ({
  at: new Date(NOW - daysAgo * DAY).toISOString(),
  category,
});

const snap = (
  hoursAgo: number,
  severity: AiDoctorContextManualSnapshotInput["severity"] = "ok",
): AiDoctorContextManualSnapshotInput => ({
  at: new Date(NOW - hoursAgo * HOUR).toISOString(),
  severity,
});

describe("AI Doctor Context — fill-loop regression: manual snapshot", () => {
  it("lists `recent-manual-sensor-snapshot` as missing before any snapshot exists", () => {
    const r = evaluateAiDoctorContext({
      plant: plant(),
      recentEvents: [ev(1, "notes"), ev(2, "watering")],
      recentManualSnapshots: [],
      now: NOW,
    });
    expect(r.missing).toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).not.toContain("recent-manual-sensor-snapshot");
  });

  it("clears `recent-manual-sensor-snapshot` once a snapshot inside the 7d window exists", () => {
    const r = evaluateAiDoctorContext({
      plant: plant(),
      recentEvents: [ev(1, "notes"), ev(2, "watering")],
      recentManualSnapshots: [snap(6)], // 6h ago
      now: NOW,
    });
    expect(r.missing).not.toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).toContain("fresh-manual-sensor-snapshot");
    expect(r.counts.recentManualSnapshots).toBe(1);
  });

  it("snapshot within window appears in evidence and is not also listed as missing", () => {
    const justUnderWindow = (AI_DOCTOR_RECENT_WINDOW_MS / HOUR) - 1; // ~6d 23h
    const r = evaluateAiDoctorContext({
      plant: plant(),
      recentEvents: [ev(1, "watering"), ev(2, "notes")],
      recentManualSnapshots: [snap(justUnderWindow)],
      now: NOW,
    });
    expect(r.evidence).toContain("recent-manual-sensor-snapshot");
    expect(r.missing).not.toContain("recent-manual-sensor-snapshot");
  });

  it("snapshot outside the 7d window does NOT falsely satisfy readiness", () => {
    const overWindow = AI_DOCTOR_RECENT_EVENT_WINDOW_DAYS + 1; // 8 days
    const r = evaluateAiDoctorContext({
      plant: plant(),
      recentEvents: [ev(1, "notes"), ev(2, "watering")],
      recentManualSnapshots: [
        { at: new Date(NOW - overWindow * DAY).toISOString(), severity: "ok" },
      ],
      now: NOW,
    });
    expect(r.missing).toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).not.toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).not.toContain("fresh-manual-sensor-snapshot");
  });

  it("snapshot older than the 48h fresh window is recent but not fresh", () => {
    const olderThanFresh = AI_DOCTOR_SNAPSHOT_FRESH_HOURS + 1; // 49h
    const r = evaluateAiDoctorContext({
      plant: plant(),
      recentEvents: [ev(1, "watering"), ev(2, "notes")],
      recentManualSnapshots: [snap(olderThanFresh)],
      now: NOW,
    });
    expect(r.evidence).toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).not.toContain("fresh-manual-sensor-snapshot");
  });
});

describe("AI Doctor Context — fill-loop regression: recent note/observation", () => {
  it("lists `recent-timeline-activity` as missing when no recent events exist", () => {
    const r = evaluateAiDoctorContext({
      plant: plant(),
      recentEvents: [],
      recentManualSnapshots: [],
      now: NOW,
    });
    expect(r.missing).toContain("recent-timeline-activity");
    expect(r.missing).toContain("recent-watering-or-feeding");
  });

  it("clears `recent-timeline-activity` once two recent events exist", () => {
    const r = evaluateAiDoctorContext({
      plant: plant(),
      recentEvents: [ev(0.5, "notes"), ev(2, "notes")],
      recentManualSnapshots: [],
      now: NOW,
    });
    expect(r.missing).not.toContain("recent-timeline-activity");
    expect(r.evidence).toContain("recent-timeline-activity");
  });

  it("clears `recent-watering-or-feeding` once a watering log exists in window", () => {
    const r = evaluateAiDoctorContext({
      plant: plant(),
      recentEvents: [ev(1, "watering"), ev(3, "notes")],
      recentManualSnapshots: [],
      now: NOW,
    });
    expect(r.missing).not.toContain("recent-watering-or-feeding");
    expect(r.evidence).toContain("recent-watering-or-feeding");
  });
});

describe("AI Doctor Context — fill-loop regression: plant photo (pure rules)", () => {
  it("lists `plant-photo` as missing when no photo context is present", () => {
    const r = evaluateAiDoctorContext({
      plant: plant({ hasPlantPhoto: false }),
      recentEvents: [ev(1, "notes"), ev(2, "watering")],
      recentManualSnapshots: [snap(2)],
      now: NOW,
    });
    expect(r.missing).toContain("plant-photo");
    expect(r.evidence).not.toContain("plant-photo");
  });

  it("clears `plant-photo` when the plant input carries photo context", () => {
    const r = evaluateAiDoctorContext({
      plant: plant({ hasPlantPhoto: true }),
      recentEvents: [ev(1, "notes"), ev(2, "watering")],
      recentManualSnapshots: [snap(2)],
      now: NOW,
    });
    expect(r.missing).not.toContain("plant-photo");
    expect(r.evidence).toContain("plant-photo");
  });
});

describe("AI Doctor Context — shared recency-window source of truth", () => {
  it("rules and shared config agree on the recent-event window (7 days)", () => {
    expect(AI_DOCTOR_RECENT_WINDOW_MS).toBe(
      AI_DOCTOR_CONTEXT_READINESS_CONFIG.recentEventWindowMs,
    );
    expect(AI_DOCTOR_RECENT_WINDOW_MS).toBe(
      AI_DOCTOR_RECENT_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
  });

  it("rules and shared config agree on the snapshot-fresh window (48 hours)", () => {
    expect(AI_DOCTOR_SNAPSHOT_FRESH_MS).toBe(
      AI_DOCTOR_CONTEXT_READINESS_CONFIG.snapshotFreshMs,
    );
    expect(AI_DOCTOR_SNAPSHOT_FRESH_MS).toBe(
      AI_DOCTOR_SNAPSHOT_FRESH_HOURS * 60 * 60 * 1000,
    );
  });

  it("a snapshot exactly inside the recent window is counted as recent", () => {
    const r = evaluateAiDoctorContext({
      plant: plant(),
      recentEvents: [ev(1, "watering"), ev(2, "notes")],
      recentManualSnapshots: [
        {
          at: new Date(NOW - (AI_DOCTOR_RECENT_WINDOW_MS - HOUR)).toISOString(),
          severity: "ok",
        },
      ],
      now: NOW,
    });
    expect(r.evidence).toContain("recent-manual-sensor-snapshot");
    expect(r.missing).not.toContain("recent-manual-sensor-snapshot");
  });
});

describe("AI Doctor Context — Coach ambiguous plant fallback", () => {
  it("renders calm instructional copy when multiple plants and no selection", () => {
    render(
      <MemoryRouter>
        <CoachAiDoctorContextPanel
          plants={[
            { id: "p1", name: "Plant A" },
            { id: "p2", name: "Plant B" },
          ]}
          selectedPlantId={null}
          diaryEntries={[]}
        />
      </MemoryRouter>,
    );
    const panel = screen.getByTestId("coach-ai-doctor-context-panel");
    expect(panel.getAttribute("data-ambiguous")).toBe("true");
    expect(
      screen.getByTestId("coach-ai-doctor-context-ambiguous-notice").textContent,
    ).toBe(COACH_AI_DOCTOR_CONTEXT_AMBIGUOUS_COPY);
    // Calm, instructive — no diagnosis claims, no AI confidence wording.
    expect(COACH_AI_DOCTOR_CONTEXT_AMBIGUOUS_COPY).toMatch(/select a plant/i);
  });
});
