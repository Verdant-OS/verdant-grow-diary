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
import { supabase } from "@/integrations/supabase/client";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
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

function recoveredDraftFromRecord(record: PendingManualSnapshot) {
  return restoreManualSnapshotValues(record);
}

function expectNoSupabaseCalls() {
  expect(supabase.rpc).not.toHaveBeenCalled();
  expect(supabase.from).not.toHaveBeenCalled();
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
    const pending = readPendingManualSnapshot(ownerId);
    if (pending.status !== "pending") throw new Error("expected pending restore record");

    expect(
      restoreUnconfirmedManualDraftValues(currentDraft(), recoveredDraftFromRecord(pending.record)),
    ).toEqual({
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
    expectNoSupabaseCalls();
  });

  it("confirmed save clears the pending snapshot so nothing is restorable", () => {
    const record = pendingRecord();
    claimPendingManualSnapshot(record);
    expect(clearPendingManualSnapshot(record)).toBe(true);
    const pending = readPendingManualSnapshot(ownerId);
    expect(pending).toEqual({ status: "empty" });
    const recovered =
      pending.status === "pending" ? restoreManualSnapshotValues(pending.record) : null;
    expect(recovered).toBeNull();
    expectNoSupabaseCalls();
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["malformed", "{"],
  ])("returns no restorable values for %s stored input", (_label, raw) => {
    if (raw !== null) sessionStorage.setItem(key, raw);
    const fallbackRecovered = recoveredDraftFromRecord(pendingRecord());
    const pending = readPendingManualSnapshot(ownerId);
    const recovered =
      pending.status === "pending" ? restoreManualSnapshotValues(pending.record) : null;
    expect(recovered).toBeNull();
    const restoredFromFallback = restoreUnconfirmedManualDraftValues(
      currentDraft(),
      fallbackRecovered,
    );
    expect(restoredFromFallback.form).toEqual(fallbackRecovered.form);
    expect(restoredFromFallback.tempUnitOverride).toBe(fallbackRecovered.tempUnitOverride);
    expect(restoredFromFallback.saveUnconfirmed).toBe(true);
    expectNoSupabaseCalls();
  });
});
