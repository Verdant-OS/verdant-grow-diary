/**
 * PlantDetailAiDoctorReadiness (live caller) — verifies the component
 * passes the REAL intake classification from `useSensorBridgeHealth`
 * into the readiness builder. No presence-to-usable synthesis allowed.
 *
 * Read-only render test. No writes, no AI, no action_queue, no device
 * control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const useRecentMock = vi.fn();
const useBridgeMock = vi.fn();

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: (id: string | null | undefined) => useRecentMock(id),
}));
vi.mock("@/hooks/useSensorBridgeHealth", () => ({
  useSensorBridgeHealth: () => useBridgeMock(),
}));

import PlantDetailAiDoctorReadiness from "@/components/PlantDetailAiDoctorReadiness";
import type {
  SensorSnapshotStatus,
  SensorSnapshotReasonCode,
} from "@/lib/sensorSnapshotStatusContract";

const ROOT = resolve(__dirname, "../..");
const COMPONENT_SRC = readFileSync(
  resolve(ROOT, "src/components/PlantDetailAiDoctorReadiness.tsx"),
  "utf8",
);

function renderCard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PlantDetailAiDoctorReadiness
          plantId="plant-1"
          stage="veg"
          hasPlantPhoto
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setBridge(
  status: SensorSnapshotStatus | null,
  reasonCode: SensorSnapshotReasonCode | null,
) {
  if (status === null) {
    useBridgeMock.mockReturnValue({ data: undefined, isLoading: false });
    return;
  }
  useBridgeMock.mockReturnValue({
    data: {
      state: status,
      status,
      headline: "Sensor bridge status",
      message: "x",
      controlDisclosure: "No device control.",
      latestAcceptedAtIso: null,
      latestRejectedAtIso: null,
      latestReasonCode: reasonCode,
      sourceLabel: null,
      bridgeName: null,
      countsAsHealthyEvidence: status === "usable",
    },
    isLoading: false,
  });
}

// Recent activity with one snapshot row → legacy `hasSensorSnapshot=true`
const ROWS_WITH_SNAPSHOT = [
  {
    id: "e1",
    event_type: "quick_log",
    occurred_at: new Date().toISOString(),
    note: "n",
    plant_id: "plant-1",
    tent_id: null,
    photo_url: null,
    details: {
      sensor_snapshot: { at: new Date().toISOString(), temp_f: 75 },
    },
  },
];

beforeEach(() => {
  useRecentMock.mockReset();
  useBridgeMock.mockReset();
  useRecentMock.mockReturnValue({ data: ROWS_WITH_SNAPSHOT, isLoading: false });
});

describe("PlantDetailAiDoctorReadiness — live caller × real intake classification", () => {
  describe("no presence-to-usable synthesis", () => {
    it("source does NOT synthesize usable from hasSensorSnapshot boolean", () => {
      // Old shape was: hasSensorSnapshot ? { status: "usable", ... } : null.
      expect(COMPONENT_SRC).not.toMatch(
        /signals\.hasSensorSnapshot[\s\S]{0,200}status:\s*["']usable["']/,
      );
      expect(COMPONENT_SRC).not.toMatch(
        /hasSensorSnapshot\s*\?\s*\{[\s\S]{0,200}usable/,
      );
    });

    it("sources sensorSnapshot from useSensorBridgeHealth via classificationFromStatusResult", () => {
      expect(COMPONENT_SRC).toMatch(/useSensorBridgeHealth/);
      expect(COMPONENT_SRC).toMatch(/classificationFromStatusResult/);
    });
  });

  describe("UI panel reflects real intake classification", () => {
    const cases: Array<{
      status: SensorSnapshotStatus;
      reasonCode: SensorSnapshotReasonCode;
      mode: string;
      nextActionLabel: string | null;
    }> = [
      {
        status: "usable",
        reasonCode: "fresh_accept",
        mode: "healthy",
        nextActionLabel: null,
      },
      {
        status: "stale",
        reasonCode: "stale_timestamp",
        mode: "cautionary",
        nextActionLabel: "Add fresh sensor snapshot",
      },
      {
        status: "invalid",
        reasonCode: "malformed_payload",
        mode: "unsafe",
        nextActionLabel: "Review sensor intake",
      },
      {
        status: "needs_review",
        reasonCode: "none_accepted",
        mode: "unsafe",
        nextActionLabel: "Review snapshot issue",
      },
      {
        status: "no_data",
        reasonCode: "none_received",
        mode: "missing",
        nextActionLabel: "Add sensor snapshot",
      },
    ];

    for (const c of cases) {
      it(`status="${c.status}" → mode=${c.mode}, exact status+reason rendered`, () => {
        setBridge(c.status, c.reasonCode);
        renderCard();
        const panel = screen.getByTestId(
          "plant-detail-ai-doctor-sensor-evidence-panel",
        );
        expect(panel.getAttribute("data-status")).toBe(c.status);
        expect(panel.getAttribute("data-mode")).toBe(c.mode);
        expect(panel.getAttribute("data-counts-as-healthy")).toBe(
          c.status === "usable" ? "true" : "false",
        );
        expect(
          screen.getByTestId("plant-detail-ai-doctor-sensor-evidence-status")
            .textContent,
        ).toContain(c.status);
        expect(
          screen.getByTestId("plant-detail-ai-doctor-sensor-evidence-reason")
            .textContent,
        ).toBeTruthy();

        if (c.nextActionLabel) {
          const btn = screen.getByTestId(
            `plant-detail-ai-doctor-sensor-evidence-next-action-${c.status}`,
          );
          expect(btn.textContent).toContain(c.nextActionLabel);
        } else {
          expect(
            screen.queryByTestId(
              `plant-detail-ai-doctor-sensor-evidence-next-action-${c.status}`,
            ),
          ).toBeNull();
        }
      });
    }
  });

  describe("usable clears the missing 'no_sensor_snapshot' bullet", () => {
    it("does not show no_sensor_snapshot missing bullet when usable", () => {
      setBridge("usable", "fresh_accept");
      renderCard();
      expect(
        screen.queryByTestId(
          "plant-detail-ai-doctor-readiness-missing-no_sensor_snapshot",
        ),
      ).toBeNull();
    });
  });

  describe("non-usable statuses do NOT clear the missing bullet", () => {
    const nonUsable: SensorSnapshotStatus[] = [
      "stale",
      "invalid",
      "needs_review",
      "no_data",
    ];
    for (const status of nonUsable) {
      it(`status="${status}" keeps the no_sensor_snapshot missing bullet`, () => {
        setBridge(status, "none_received");
        renderCard();
        expect(
          screen.getByTestId(
            "plant-detail-ai-doctor-readiness-missing-no_sensor_snapshot",
          ),
        ).toBeTruthy();
      });
    }
  });

  describe("no bridge data → no_data, missing mode", () => {
    it("treats missing bridge view-model as no_data", () => {
      setBridge(null, null);
      renderCard();
      const panel = screen.getByTestId(
        "plant-detail-ai-doctor-sensor-evidence-panel",
      );
      expect(panel.getAttribute("data-status")).toBe("no_data");
      expect(panel.getAttribute("data-mode")).toBe("missing");
    });
  });
});
