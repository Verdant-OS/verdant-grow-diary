import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePersistEnvironmentAlerts,
  type PersistEnvironmentAlertsInput,
} from "@/hooks/usePersistEnvironmentAlerts";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";

const h = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/alerts", () => ({
  listAlerts: (...args: unknown[]) => h.list(...args),
  saveAlert: (...args: unknown[]) => h.save(...args),
  logAlertEvent: (...args: unknown[]) => h.log(...args),
}));

function breachInput(growId: string): PersistEnvironmentAlertsInput {
  return {
    growId,
    tentId: "tent-a",
    enabled: true,
    snapshot: {
      ...EMPTY_SNAPSHOT,
      source: "live",
      ts: new Date().toISOString(),
      temp: 35,
      rh: 85,
      vpd: 1.1,
    },
    quality: { quality: "good", headline: "", reasons: [], suspiciousFields: [] },
    targets: {
      status: "out_of_range",
      headline: "",
      reasons: [],
      metrics: [
        { metric: "temp", label: "Temperature", value: 35, min: 19, max: 28, state: "high" },
        { metric: "rh", label: "Humidity", value: 85, min: 40, max: 70, state: "high" },
      ],
    },
  };
}

beforeEach(() => {
  h.list.mockReset().mockResolvedValue([]);
  h.save.mockReset().mockResolvedValue({ id: "alert-a" });
  h.log.mockReset().mockResolvedValue({ id: "audit-a" });
});

describe("environment alert persistence grow-scoped dedupe", () => {
  it("does not suppress a matching rule in a different grow after the first grow persisted it", async () => {
    const first = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: breachInput("grow-a"),
    });
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    expect(h.save.mock.calls[0][0].grow_id).toBe("grow-a");

    const second = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: breachInput("grow-b"),
    });
    await waitFor(() =>
      expect(h.save.mock.calls.some((call) => call[0].grow_id === "grow-b")).toBe(true),
    );
    expect(h.save.mock.calls.filter((call) => call[0].grow_id === "grow-b")).toHaveLength(2);

    first.unmount();
    second.unmount();
  });

  it("releases in-flight reservations when the effect is cancelled before listAlerts settles", async () => {
    let resolveList!: (rows: unknown[]) => void;
    h.list.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );
    const initial = breachInput("grow-a");
    const view = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: initial,
    });
    view.unmount();
    await act(async () => {
      resolveList([]);
    });

    h.save.mockClear();
    renderHook((props) => usePersistEnvironmentAlerts(props), { initialProps: initial });
    await waitFor(() => expect(h.save).toHaveBeenCalled());
  });
});
