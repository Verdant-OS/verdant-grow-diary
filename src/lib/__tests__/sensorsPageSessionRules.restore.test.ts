import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildManualReadingPayloads } from "@/lib/sensorReadingManualEntryRules";
import {
  claimPendingManualSnapshot,
  clearPendingManualSnapshot,
  readPendingManualSnapshot,
  restoreManualSnapshotValues,
  type PendingManualSnapshot,
} from "@/lib/manualSensorPendingSnapshotStore";
import {
  createManualDraftValues,
  editManualDraftValues,
  restoreUnconfirmedManualDraftValues,
} from "@/lib/sensorsPageSessionRules";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

const ownerId = "owner-a";
const key = `verdant:sensors:pending-manual:v1:${ownerId}`;

function pendingRecord(): PendingManualSnapshot {
  return {
    version: 1,
    ownerId,
    payloads: buildManualReadingPayloads({
      tentId: "11111111-1111-4111-8111-111111111111",
      ts: "2026-09-17T12:00:00.000Z",
      metrics: [
        { metric: "temperature_c", value: 25 },
        { metric: "humidity_pct", value: 60 },
      ],
      deviceNote: "Handheld meter",
    }),
  };
}

function currentDraft() {
  return editManualDraftValues(
    createManualDraftValues({ airTemp: "70", airTempUnit: "F", humidityPct: "40" }),
    {
      devicePreset: "custom",
      deviceCustom: "Existing meter",
      hasEditedReading: true,
    },
  );
}

function restoreFromStoredPendingDraft() {
  const pending = readPendingManualSnapshot(ownerId);
  if (pending.status !== "pending") return null;
  return restoreUnconfirmedManualDraftValues(
    currentDraft(),
    restoreManualSnapshotValues(pending.record),
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  sessionStorage.clear();
});

describe("restoreUnconfirmedManualDraftValues pending recovery", () => {
  it("restores an unconfirmed manual draft with its values intact", () => {
    const record = pendingRecord();
    expect(claimPendingManualSnapshot(record)).toEqual({ status: "claimed", record });

    expect(restoreFromStoredPendingDraft()).toEqual({
      form: {
        airTemp: "25",
        airTempUnit: "C",
        humidityPct: "60",
        vpdKpa: "",
        co2Ppm: "",
        soilMoisturePct: "",
        ppfd: "",
      },
      tempUnitOverride: "C",
      devicePreset: "custom",
      deviceCustom: "Handheld meter",
      hasEditedReading: true,
      revision: 2,
      pendingStandardSnapshot: null,
      saveUnconfirmed: true,
      lastSaved: null,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not restore confirmed saved values as drafts", () => {
    const record = pendingRecord();
    claimPendingManualSnapshot(record);
    expect(clearPendingManualSnapshot(record)).toBe(true);

    expect(restoreFromStoredPendingDraft()).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["malformed", "{"],
  ])("returns nothing for %s stored input and does not throw", (_label, raw) => {
    if (raw !== null) sessionStorage.setItem(key, raw);

    expect(() => restoreFromStoredPendingDraft()).not.toThrow();
    expect(restoreFromStoredPendingDraft()).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
