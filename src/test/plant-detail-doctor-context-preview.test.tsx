/**
 * Plant Detail Doctor Context Preview — pure helper + render coverage +
 * static safety. Read-only and presentation-only. No AI calls, writes,
 * schema/RLS/migrations, edge functions, storage, auth, automation,
 * device control, calendar/notification/email/reminder scheduling,
 * service_role, functions.invoke, or fake-live sensor data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const useRecentMock = vi.fn();
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: (id: string | null | undefined) => useRecentMock(id),
}));

import {
  buildPlantDetailDoctorContextPreview,
  DOCTOR_CONTEXT_HELPER_COPY,
  DOCTOR_CONTEXT_STALE_AFTER_MS,
} from "@/lib/plantDetailDoctorContextPreview";
import type { PlantRecentActivityRow } from "@/lib/plantRecentActivityRules";
import PlantDetailDoctorContextPreview from "@/components/PlantDetailDoctorContextPreview";

const ROOT = resolve(__dirname, "../..");
const HELPER = readFileSync(
  resolve(ROOT, "src/lib/plantDetailDoctorContextPreview.ts"),
  "utf8",
);
const COMPONENT = readFileSync(
  resolve(ROOT, "src/components/PlantDetailDoctorContextPreview.tsx"),
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
  /\bdevice[-\s]?control\b/i,
];

const NOW = new Date("2026-06-01T12:00:00.000Z");
const FRESH = "2026-05-30T10:00:00.000Z";
const STALE_AT = new Date(NOW.getTime() - DOCTOR_CONTEXT_STALE_AFTER_MS - 60_000).toISOString();

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

describe("buildPlantDetailDoctorContextPreview", () => {
  it("marks stage available when known; missing when blank/unknown", () => {
    const known = buildPlantDetailDoctorContextPreview({
      stage: "veg",
      recentActivity: [],
      now: NOW,
    });
    expect(known.items.find((i) => i.kind === "stage")?.state).toBe("available");
    expect(known.items.find((i) => i.kind === "stage")?.detail).toBe("veg");

    for (const stage of [null, undefined, "", "unknown", "  "]) {
      const r = buildPlantDetailDoctorContextPreview({
        stage: stage as string | null | undefined,
        recentActivity: [],
        now: NOW,
      });
      expect(r.items.find((i) => i.kind === "stage")?.state).toBe("missing");
    }
  });

  it("derives timeline/photo/sensor/watering states deterministically", () => {
    const rows: PlantRecentActivityRow[] = [
      row({ id: "a", eventType: "watering", occurredAt: FRESH }),
      row({
        id: "b",
        eventType: "note",
        occurredAt: FRESH,
        hasPhoto: true,
        hasSnapshot: true,
        snapshotAt: FRESH,
      }),
    ];
    const r = buildPlantDetailDoctorContextPreview({
      stage: "flower",
      hasPlantPhoto: false,
      recentActivity: rows,
      now: NOW,
    });
    expect(r.items.find((i) => i.kind === "timeline")?.state).toBe("available");
    expect(r.items.find((i) => i.kind === "photo")?.state).toBe("available");
    expect(r.items.find((i) => i.kind === "sensor_snapshot")?.state).toBe("available");
    expect(r.items.find((i) => i.kind === "watering_feeding")?.state).toBe("available");
  });

  it("falls back to plant photo flag when no recent photo entry exists", () => {
    const r = buildPlantDetailDoctorContextPreview({
      stage: "veg",
      hasPlantPhoto: true,
      recentActivity: [],
      now: NOW,
    });
    expect(r.items.find((i) => i.kind === "photo")?.state).toBe("available");
  });

  it("marks signals stale when older than threshold", () => {
    const rows: PlantRecentActivityRow[] = [
      row({
        id: "a",
        eventType: "watering",
        occurredAt: STALE_AT,
        hasPhoto: true,
        hasSnapshot: true,
        snapshotAt: STALE_AT,
      }),
    ];
    const r = buildPlantDetailDoctorContextPreview({
      stage: "veg",
      hasPlantPhoto: false,
      recentActivity: rows,
      now: NOW,
    });
    expect(r.items.find((i) => i.kind === "timeline")?.state).toBe("stale");
    expect(r.items.find((i) => i.kind === "photo")?.state).toBe("stale");
    expect(r.items.find((i) => i.kind === "sensor_snapshot")?.state).toBe("stale");
    expect(r.items.find((i) => i.kind === "watering_feeding")?.state).toBe("stale");
  });

  it("marks signals missing when no rows", () => {
    const r = buildPlantDetailDoctorContextPreview({
      stage: null,
      recentActivity: [],
      now: NOW,
    });
    for (const kind of ["timeline", "photo", "sensor_snapshot", "watering_feeding"] as const) {
      expect(r.items.find((i) => i.kind === kind)?.state).toBe("missing");
    }
    expect(r.missingCount).toBeGreaterThanOrEqual(5);
    expect(r.totalCount).toBe(5);
  });

  it("renders open alerts and pending actions rows only when counts provided", () => {
    const withCounts = buildPlantDetailDoctorContextPreview({
      stage: "veg",
      recentActivity: [],
      openAlertsCount: 2,
      pendingActionsCount: 0,
      now: NOW,
    });
    expect(withCounts.items.find((i) => i.kind === "open_alerts")?.state).toBe("available");
    expect(withCounts.items.find((i) => i.kind === "open_alerts")?.detail).toBe("2 open");
    expect(withCounts.items.find((i) => i.kind === "pending_actions")?.state).toBe("missing");

    const withoutCounts = buildPlantDetailDoctorContextPreview({
      stage: "veg",
      recentActivity: [],
      now: NOW,
    });
    expect(withoutCounts.items.find((i) => i.kind === "open_alerts")).toBeUndefined();
    expect(withoutCounts.items.find((i) => i.kind === "pending_actions")).toBeUndefined();
  });

  it("clamps negative/invalid counts safely", () => {
    const r = buildPlantDetailDoctorContextPreview({
      stage: "veg",
      recentActivity: [],
      openAlertsCount: -5,
      pendingActionsCount: Number.NaN,
      now: NOW,
    });
    expect(r.items.find((i) => i.kind === "open_alerts")?.state).toBe("missing");
    expect(r.items.find((i) => i.kind === "pending_actions")).toBeUndefined();
  });

  it("never leaks IDs, tokens, raw payloads, storage paths, or provenance markers", () => {
    const r = buildPlantDetailDoctorContextPreview({
      stage: "veg",
      recentActivity: [
        row({
          id: "secret-id-xyz",
          plantId: "plant-secret",
          tentId: "tent-secret",
          snapshotSourceLabel: "raw-payload-token-abc",
          hasSnapshot: true,
          snapshotAt: FRESH,
        }),
      ],
      now: NOW,
    });
    const serialized = JSON.stringify(r);
    expect(serialized).not.toMatch(/secret-id-xyz/);
    expect(serialized).not.toMatch(/plant-secret/);
    expect(serialized).not.toMatch(/tent-secret/);
    expect(serialized).not.toMatch(/raw-payload/);
  });
});

describe("<PlantDetailDoctorContextPreview />", () => {
  beforeEach(() => {
    useRecentMock.mockReset();
    useRecentMock.mockReturnValue({ data: [], isLoading: false });
  });

  function renderCard(props: Partial<React.ComponentProps<typeof PlantDetailDoctorContextPreview>> = {}) {
    return render(
      <MemoryRouter>
        <PlantDetailDoctorContextPreview
          plantId="p1"
          stage="veg"
          hasPlantPhoto={false}
          now={NOW}
          {...props}
        />
      </MemoryRouter>,
    );
  }

  it("renders the Doctor context heading and helper copy", () => {
    renderCard();
    expect(screen.getByText("Doctor context")).toBeInTheDocument();
    expect(screen.getByText(DOCTOR_CONTEXT_HELPER_COPY)).toBeInTheDocument();
  });

  it("shows Available/Missing chips for the core signals", () => {
    renderCard();
    const stage = screen.getByTestId("plant-detail-doctor-context-item-stage");
    expect(stage.getAttribute("data-state")).toBe("available");
    const timeline = screen.getByTestId("plant-detail-doctor-context-item-timeline");
    expect(timeline.getAttribute("data-state")).toBe("missing");
  });

  it("hides optional alerts/actions rows when counts are not provided", () => {
    renderCard();
    expect(screen.queryByTestId("plant-detail-doctor-context-item-open_alerts")).toBeNull();
    expect(screen.queryByTestId("plant-detail-doctor-context-item-pending_actions")).toBeNull();
  });

  it("renders optional alerts/actions rows when counts are provided", () => {
    renderCard({ openAlertsCount: 1, pendingActionsCount: 0 });
    expect(screen.getByTestId("plant-detail-doctor-context-item-open_alerts")).toBeInTheDocument();
    expect(screen.getByTestId("plant-detail-doctor-context-item-pending_actions")).toBeInTheDocument();
  });

  it("renders an Ask Doctor CTA routed to /doctor with plant context", () => {
    renderCard();
    const cta = screen.getByTestId("plant-detail-doctor-context-ask-cta");
    expect(cta.getAttribute("href")).toBe("/doctor?plantId=p1");
  });

  it("renders nothing without a plantId", () => {
    const { container } = renderCard({ plantId: null });
    expect(container.firstChild).toBeNull();
  });

  it("never imports AI gateway, writes, or device-control modules", () => {
    expect(COMPONENT).not.toMatch(/functions\.invoke/);
    expect(COMPONENT).not.toMatch(/ai-gateway/);
    expect(COMPONENT).not.toMatch(/openai|anthropic|gemini/i);
    expect(COMPONENT).not.toMatch(/supabase\.from/);
    expect(COMPONENT).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });

  it("copy does not promise diagnosis certainty or automation", () => {
    renderCard();
    const card = screen.getByTestId("plant-detail-doctor-context-preview-card");
    const text = card.textContent ?? "";
    expect(text).not.toMatch(/guarantee|certain|definitely|will fix|auto[-\s]?run|autopilot/i);
    expect(text).not.toMatch(/control (fan|light|pump|heater|humidifier|dehumidifier)/i);
  });
});

describe("Doctor Context Preview — static safety", () => {
  it("helper avoids all forbidden patterns", () => {
    for (const pat of FORBIDDEN) {
      expect(HELPER, `helper matched ${pat}`).not.toMatch(pat);
    }
  });

  it("component avoids all forbidden patterns", () => {
    for (const pat of FORBIDDEN) {
      expect(COMPONENT, `component matched ${pat}`).not.toMatch(pat);
    }
  });
});
