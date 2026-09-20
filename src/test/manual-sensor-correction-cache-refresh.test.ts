import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { createSensorsPageSessionController } from "@/hooks/useSensorsPageSession";
import {
  STANDARD_MANUAL_CORRECTION_IDENTITY,
  createManualDraftValues,
} from "@/lib/sensorsPageSessionRules";
import { buildManualReadingPayloads } from "@/lib/sensorReadingManualEntryRules";
import {
  MANUAL_SENSOR_CORRECTION_CONFIRMED_EVENT,
  subscribeManualSensorCorrections,
} from "@/lib/manualSensorCorrectionEvents";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const prefixes = [
  ["grow", "sensors"],
  ["sensor_readings"],
  ["latest-sensor-snapshot"],
  ["plant-tent-environment"],
  ["environment-trends"],
  ["diary-range-report"],
  ["sensor", "latest"],
  ["reports-hub"],
  ["post-grow-report"],
];
function prepare() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const controller = createSensorsPageSessionController(client, owner)!;
  controller.reconcileSelection({
    intent: { tentId, requireExactMatch: true },
    intentKey: "correction",
    tents: [{ id: tentId }],
    tentsLoaded: true,
  });
  const draft = controller.getOrInitializeDraft({
    epoch: controller.getSnapshot()!.selection.draftEpoch,
    correctionIdentity: "correction-existing-reading",
    defaultTentId: tentId,
    ownedTentIds: [tentId],
    initial: createManualDraftValues({
      airTemp: "24",
      airTempUnit: "C",
      humidityPct: "",
      vpdKpa: "",
      co2Ppm: "",
      soilMoisturePct: "",
      ppfd: "",
    }),
  })!;
  const claimed = controller.claimSave(
    draft.identity,
    buildManualReadingPayloads({
      tentId,
      metrics: [{ metric: "temperature_c", value: 24 }],
      ts: "2026-09-16T08:00:00Z",
    }),
  );
  if (claimed.status !== "claimed") throw new Error("Fixture save was not claimed");
  const keys = prefixes.map((prefix) => [...prefix, tentId, "owner", owner]);
  keys.forEach((key) => client.setQueryData(key, [{ value: 25 }]));
  const invalidate = vi.spyOn(client, "invalidateQueries");
  return { client, controller, claim: claimed.claim, keys, invalidate };
}
function prepareStandard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const controller = createSensorsPageSessionController(client, owner)!;
  controller.reconcileSelection({
    intent: { tentId, requireExactMatch: true },
    intentKey: "standard",
    tents: [{ id: tentId }],
    tentsLoaded: true,
  });
  const draft = controller.getOrInitializeDraft({
    epoch: controller.getSnapshot()!.selection.draftEpoch,
    correctionIdentity: STANDARD_MANUAL_CORRECTION_IDENTITY,
    defaultTentId: tentId,
    ownedTentIds: [tentId],
    initial: createManualDraftValues({
      airTemp: "24",
      airTempUnit: "C",
      humidityPct: "57",
      vpdKpa: "",
      co2Ppm: "",
      soilMoisturePct: "",
      ppfd: "",
    }),
  })!;
  const claimed = controller.claimSave(
    draft.identity,
    buildManualReadingPayloads({
      tentId,
      metrics: [{ metric: "humidity_pct", value: 57 }],
      ts: "2026-09-16T12:00:00.123Z",
    }),
  );
  if (claimed.status !== "claimed") throw new Error("Fixture save was not claimed");
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const refresh = vi.fn();
  const stop = subscribeManualSensorCorrections(owner, refresh);
  return { client, controller, claim: claimed.claim, invalidate, refresh, stop };
}
beforeEach(() => sessionStorage.clear());
describe("confirmed correction cache refresh", () => {
  it("notifies same-owner readers once after confirmation without creating an observation event", () => {
    const { client, controller, claim } = prepare();
    const refresh = vi.fn();
    const otherOwner = vi.fn();
    const created = vi.fn();
    const stop = subscribeManualSensorCorrections(owner, refresh);
    const stopOther = subscribeManualSensorCorrections("different-owner", otherOwner);
    window.addEventListener("verdant:sensor-reading-created", created);
    try {
      controller.settleSave(claim, { status: "success" });
      controller.settleSave(claim, { status: "success" });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(otherOwner).not.toHaveBeenCalled();
      expect(created).not.toHaveBeenCalled();
      stop();
      window.dispatchEvent(
        new CustomEvent(MANUAL_SENSOR_CORRECTION_CONFIRMED_EVENT, {
          detail: { ownerId: owner, tentId },
        }),
      );
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      stop();
      stopOther();
      window.removeEventListener("verdant:sensor-reading-created", created);
      client.clear();
    }
  });
  it.each(["unconfirmed", "obsolete"])("does not notify readers for %s completion", (state) => {
    const { client, controller, claim } = prepare();
    const refresh = vi.fn();
    const stop = subscribeManualSensorCorrections(owner, refresh);
    try {
      if (state === "obsolete") client.clear();
      controller.settleSave(claim, { status: state === "obsolete" ? "success" : "unconfirmed" });
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      stop();
      client.clear();
    }
  });
  it("refreshes an active reading observer from the old value to the confirmed correction", async () => {
    const { client, controller, claim, keys } = prepare();
    const fetch = vi.fn().mockResolvedValue([{ value: 24 }]);
    const observer = new QueryObserver(client, {
      queryKey: keys[1],
      queryFn: fetch,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    expect(observer.getCurrentResult().data).toEqual([{ value: 25 }]);
    expect(fetch).not.toHaveBeenCalled();
    controller.settleSave(claim, { status: "success" });
    await waitFor(() => expect(observer.getCurrentResult().data).toEqual([{ value: 24 }]));
    expect(fetch).toHaveBeenCalledTimes(1);
    unsubscribe();
    client.clear();
  });
  it("keeps the confirmed cached value when a save is still uncertain", async () => {
    const { client, controller, claim, keys } = prepare();
    const fetch = vi.fn().mockResolvedValue([{ value: 24 }]);
    const observer = new QueryObserver(client, {
      queryKey: keys[1],
      queryFn: fetch,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    controller.settleSave(claim, { status: "unconfirmed" });
    await Promise.resolve();
    expect(observer.getCurrentResult().data).toEqual([{ value: 25 }]);
    expect(fetch).not.toHaveBeenCalled();
    unsubscribe();
    client.clear();
  });
  it("invalidates every existing sensor family after a confirmed correction", () => {
    const { client, controller, claim, keys, invalidate } = prepare();
    expect(controller.settleSave(claim, { status: "success" })).toBe(true);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(prefixes);
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    client.clear();
  });
  it("does not invalidate readings when the correction is unconfirmed", () => {
    const { client, controller, claim, keys, invalidate } = prepare();
    expect(controller.settleSave(claim, { status: "unconfirmed" })).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(false));
    client.clear();
  });
  it("ignores a stale completion after private session state is cleared", () => {
    const { client, controller, claim, invalidate } = prepare();
    client.clear();
    expect(controller.settleSave(claim, { status: "success" })).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });
  it("does not repeat invalidation when the same completion arrives twice", () => {
    const { client, controller, claim, invalidate } = prepare();
    expect(controller.settleSave(claim, { status: "success" })).toBe(true);
    expect(controller.settleSave(claim, { status: "success" })).toBe(false);
    expect(invalidate).toHaveBeenCalledTimes(prefixes.length);
    client.clear();
  });
  it("does not emit a correction refresh signal after a standard snapshot success", () => {
    const { client, controller, claim, invalidate, refresh, stop } = prepareStandard();
    try {
      expect(controller.settleSave(claim, { status: "success" })).toBe(true);
      expect(invalidate).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      stop();
      client.clear();
    }
  });
});
