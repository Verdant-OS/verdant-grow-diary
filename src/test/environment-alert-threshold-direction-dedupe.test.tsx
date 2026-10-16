/**
 * Regression: open alert direction dedupe blocks a second RH breach row when
 * the configured target range differs from an existing stage-range alert (#2165, #2179).
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePersistEnvironmentAlerts,
  type PersistEnvironmentAlertsInput,
} from "@/hooks/usePersistEnvironmentAlerts";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";
import { evaluateSensorQuality } from "@/lib/sensorQuality";

const alertsIo = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@/lib/alerts", () => ({
  listAlerts: (...args: unknown[]) => alertsIo.list(...args),
  saveAlert: (...args: unknown[]) => alertsIo.save(...args),
  logAlertEvent: (...args: unknown[]) => alertsIo.log(...args),
}));

beforeEach(() => {
  alertsIo.list.mockReset().mockResolvedValue([]);
  alertsIo.save.mockReset().mockResolvedValue({ id: "alert-new" });
  alertsIo.log.mockReset().mockResolvedValue({ id: "evt-new" });
});

describe("usePersistEnvironmentAlerts threshold direction dedupe (#2165, #2179)", () => {
  it("skips insert when an open row already exists for the same metric and above/below direction", async () => {
    alertsIo.list.mockResolvedValue([
      {
        id: "open-rh-stage",
        metric: "rh",
        title: "Humidity above stage range",
        source: "environment_alerts",
        tent_id: "tent-1",
        status: "open",
      },
    ]);

    const snapshot = {
      ...EMPTY_SNAPSHOT,
      source: "manual" as const,
      ts: new Date().toISOString(),
      temp: 32,
      rh: 85,
      vpd: 1.1,
      tent_id: "tent-1",
    };

    const hookInput: PersistEnvironmentAlertsInput = {
      growId: "grow-1",
      tentId: "tent-1",
      enabled: true,
      stage: "seedling",
      snapshot,
      quality: evaluateSensorQuality(snapshot),
      targets: compareSnapshotToTargets(snapshot, { rh: { min: 50, max: 70 } }),
    };

    const { unmount } = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: hookInput,
    });

    await waitFor(() => expect(alertsIo.list).toHaveBeenCalled());
    await waitFor(() => {
      expect(alertsIo.save).not.toHaveBeenCalled();
      expect(alertsIo.log).not.toHaveBeenCalled();
    });

    unmount();
  });
});
