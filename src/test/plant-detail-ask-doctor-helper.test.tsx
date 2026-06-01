/**
 * Plant Detail Ask Doctor Helper — pure helper + render coverage +
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
  buildPlantDetailAskDoctorHelper,
  type PlantDetailAskDoctorHelperInput,
} from "@/lib/plantDetailAskDoctorHelper";
import PlantDetailAskDoctorHelper from "@/components/PlantDetailAskDoctorHelper";

const ROOT = resolve(__dirname, "../..");
const HELPER = readFileSync(
  resolve(ROOT, "src/lib/plantDetailAskDoctorHelper.ts"),
  "utf8",
);
const COMPONENT = readFileSync(
  resolve(ROOT, "src/components/PlantDetailAskDoctorHelper.tsx"),
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

function makeInput(p: Partial<PlantDetailAskDoctorHelperInput> = {}): PlantDetailAskDoctorHelperInput {
  return {
    stage: null,
    hasTimelineEntries: false,
    hasRecentPhoto: false,
    hasSensorSnapshot: false,
    hasRecentWateringOrFeed: false,
    ...p,
  };
}

describe("buildPlantDetailAskDoctorHelper", () => {
  it("returns 'none' and correct copy when zero signals present", () => {
    const result = buildPlantDetailAskDoctorHelper(makeInput());
    expect(result.level).toBe("none");
    expect(result.copy).toBe("Add a quick note, photo, or manual sensor snapshot first for a stronger check-in.");
    expect(result.presentCount).toBe(0);
    expect(result.totalSignals).toBe(5);
  });

  it("returns 'partial' when exactly one signal is present", () => {
    const result = buildPlantDetailAskDoctorHelper(makeInput({ stage: "veg" }));
    expect(result.level).toBe("partial");
    expect(result.copy).toBe("AI Doctor works better with recent notes, photos, or a manual sensor snapshot.");
    expect(result.presentCount).toBe(1);
  });

  it("returns 'has_context' when two or more signals are present", () => {
    const result = buildPlantDetailAskDoctorHelper(
      makeInput({ stage: "flower", hasTimelineEntries: true }),
    );
    expect(result.level).toBe("has_context");
    expect(result.copy).toBe("AI Doctor has recent plant context for this check-in.");
    expect(result.presentCount).toBe(2);
  });

  it("counts all five signals correctly at maximum", () => {
    const result = buildPlantDetailAskDoctorHelper(
      makeInput({
        stage: "veg",
        hasTimelineEntries: true,
        hasRecentPhoto: true,
        hasSensorSnapshot: true,
        hasRecentWateringOrFeed: true,
      }),
    );
    expect(result.level).toBe("has_context");
    expect(result.presentCount).toBe(5);
  });

  it("treats unknown/blank stage as missing", () => {
    for (const stage of [null, undefined, "", "unknown", "  "]) {
      const result = buildPlantDetailAskDoctorHelper(
        makeInput({ stage: stage as string | null | undefined }),
      );
      expect(result.presentCount).toBe(0);
      expect(result.level).toBe("none");
    }
  });

  it("is deterministic for identical inputs", () => {
    const input = makeInput({ stage: "veg", hasRecentPhoto: true });
    const a = buildPlantDetailAskDoctorHelper(input);
    const b = buildPlantDetailAskDoctorHelper(input);
    expect(a).toEqual(b);
  });
});

describe("<PlantDetailAskDoctorHelper />", () => {
  beforeEach(() => {
    useRecentMock.mockReset();
    useRecentMock.mockReturnValue({ data: [], isLoading: false });
  });

  function renderHelper(props: Partial<React.ComponentProps<typeof PlantDetailAskDoctorHelper>> = {}) {
    return render(
      <MemoryRouter>
        <PlantDetailAskDoctorHelper
          plantId="p1"
          stage={null}
          hasPlantPhoto={false}
          {...props}
        />
      </MemoryRouter>,
    );
  }

  it("renders 'none' helper copy when no context exists", () => {
    renderHelper();
    expect(
      screen.getByText("Add a quick note, photo, or manual sensor snapshot first for a stronger check-in."),
    ).toBeInTheDocument();
  });

  it("renders 'partial' helper copy when context is partial", () => {
    renderHelper({ stage: "veg" });
    expect(
      screen.getByText("AI Doctor works better with recent notes, photos, or a manual sensor snapshot."),
    ).toBeInTheDocument();
  });

  it("renders 'has_context' helper copy when enough context exists", () => {
    useRecentMock.mockReturnValue({
      data: [
        { id: "r1", event_type: "watering", occurred_at: "2026-06-01T10:00:00Z" },
      ],
      isLoading: false,
    });
    renderHelper({ stage: "veg", hasPlantPhoto: true });
    expect(
      screen.getByText("AI Doctor has recent plant context for this check-in."),
    ).toBeInTheDocument();
  });

  it("shows loading state while data is loading", () => {
    useRecentMock.mockReturnValue({ data: [], isLoading: true });
    renderHelper();
    expect(screen.getByText("Checking plant context…")).toBeInTheDocument();
  });

  it("renders nothing without a plantId", () => {
    const { container } = renderHelper({ plantId: null });
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
    renderHelper();
    const helper = screen.getByTestId("plant-detail-ask-doctor-helper");
    const text = helper.textContent ?? "";
    expect(text).not.toMatch(/guarantee|certain|definitely|will fix|auto[-\s]?run|autopilot/i);
    expect(text).not.toMatch(/control (fan|light|pump|heater|humidifier|dehumidifier)/i);
  });
});

describe("Ask Doctor Helper — static safety", () => {
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
