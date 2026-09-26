import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingQuickLogWatering,
  clearPendingQuickLogWatering,
  readPendingQuickLogWatering,
  type PendingQuickLogWatering,
} from "@/lib/quickLogPendingWateringStore";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const plantId = "33333333-3333-4333-8333-333333333333";
const tentId = "44444444-4444-4444-8444-444444444444";
const growId = "55555555-5555-4555-8555-555555555555";
const observedAt = "2026-09-17T03:00:00.000Z";
const key = (owner = ownerA) => `verdant:quick-log:pending-watering:v1:${owner}`;

function record(): PendingQuickLogWatering {
  return {
    version: 1,
    ownerId: ownerA,
    createdAt: observedAt,
    payload: {
      idempotency_key: "watering-save-12345678",
      grow_id: growId,
      tent_id: tentId,
      plant_id: plantId,
      occurred_at: observedAt,
      note: "Water after checking the pot",
      volume_ml: 600,
      ph: 6.3,
      ec_ms_cm: 1.2,
      runoff_ml: 50,
      runoff_ph: 6.5,
      runoff_ec: 1.3,
      water_temp_c: 21,
      sensor_snapshot: {
        source: "manual",
        captured_at: observedAt,
        metrics: { temperature_c: 25, humidity_pct: 60, vpd_kpa: 1.2 },
      },
      details: {
        stage: "flower",
        root_zone_manual_observation_v1: {
          schema_version: 1,
          source: "manual",
          evidence_type: "root_zone_manual_observation",
          advisory_only: true,
          observed_at: observedAt,
          pot_weight_feel: "light",
          medium_surface: "dry",
          drainage: "normal",
        },
      },
    },
    resolved: {
      ok: true,
      targetType: "plant",
      targetId: plantId,
      plantId,
      tentId,
      growId,
    },
    attachments: { photo: true, video: false },
  };
}

const originalLocks = Object.getOwnPropertyDescriptor(window.navigator, "locks");
beforeEach(() => {
  window.sessionStorage.clear();
  clearLocalStorageForTest();
  let tail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(window.navigator, "locks", {
    configurable: true,
    value: {
      request: (_name: string, _options: unknown, callback: () => unknown) => {
        const turn = tail.then(callback);
        tail = turn.then(
          () => undefined,
          () => undefined,
        );
        return turn;
      },
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  if (originalLocks) Object.defineProperty(window.navigator, "locks", originalLocks);
  else Reflect.deleteProperty(window.navigator, "locks");
});

describe("durable pending Water Quick Log ownership", () => {
  it("reports empty only for an accessible owner slot with no record", async () => {
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "empty" });
  });

  it("persists a detached exact claim before the caller can dispatch", async () => {
    const input = record();
    const expected = record();
    const claimed = await claimPendingQuickLogWatering(input);
    expect(claimed).toEqual({ status: "claimed", record: expected });
    expect(JSON.parse(getLocalStorageItemForTest(key())!)).toEqual(expected);
    input.payload.volume_ml = 900;
    input.attachments.photo = false;
    input.payload.sensor_snapshot!.metrics.temperature_c = 30;
    expect(claimed).toEqual({ status: "claimed", record: expected });
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "pending", record: expected });
  });

  it("recovers the same payload, destination and attachment intentions after module remount", async () => {
    expect((await claimPendingQuickLogWatering(record())).status).toBe("claimed");
    vi.resetModules();
    const replacement = await import("@/lib/quickLogPendingWateringStore");
    expect(replacement.readPendingQuickLogWatering(ownerA)).toEqual({
      status: "pending",
      record: record(),
    });
    expect(replacement.readPendingQuickLogWatering(ownerA)).toEqual({
      status: "pending",
      record: record(),
    });
  });

  it("promotes an older tab-local recovery to shared storage before replay", async () => {
    const original = record();
    window.sessionStorage.setItem(key(), JSON.stringify(original));
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "pending", record: original });
    expect((await claimPendingQuickLogWatering(original)).status).toBe("claimed");
    expect(JSON.parse(getLocalStorageItemForTest(key())!)).toEqual(original);
    window.sessionStorage.clear();
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "pending", record: original });
  });

  it("blocks conflicting tab-local and shared recovery records", async () => {
    const original = record();
    expect((await claimPendingQuickLogWatering(original)).status).toBe("claimed");
    const conflicting = record();
    conflicting.payload.idempotency_key = "other-water-key";
    window.sessionStorage.setItem(key(), JSON.stringify(conflicting));
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "blocked" });
    expect((await claimPendingQuickLogWatering(original)).status).toBe("blocked");
    expect(await clearPendingQuickLogWatering(original)).toBe(false);
  });

  it("does not expire an unresolved save when the clock advances", async () => {
    const pending = record();
    pending.createdAt = "2020-01-01T00:00:00.000Z";
    expect((await claimPendingQuickLogWatering(pending)).status).toBe("claimed");
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "pending", record: pending });
  });

  it("lets identical retries claim but sends a competing draft back to the original record", async () => {
    const original = record();
    expect(await claimPendingQuickLogWatering(original)).toEqual({
      status: "claimed",
      record: original,
    });
    expect(await claimPendingQuickLogWatering(record())).toEqual({
      status: "claimed",
      record: original,
    });
    const competitor = record();
    competitor.payload.idempotency_key = "different-save-12345678";
    competitor.payload.volume_ml = 900;
    expect(await claimPendingQuickLogWatering(competitor)).toEqual({
      status: "pending",
      record: original,
    });
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "pending", record: original });
  });

  it("isolates owners when reading, claiming and clearing", async () => {
    const a = record();
    const b = { ...record(), ownerId: ownerB };
    expect((await claimPendingQuickLogWatering(a)).status).toBe("claimed");
    expect(readPendingQuickLogWatering(ownerB)).toEqual({ status: "empty" });
    expect((await claimPendingQuickLogWatering(b)).status).toBe("claimed");
    expect(await clearPendingQuickLogWatering(a)).toBe(true);
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "empty" });
    expect(readPendingQuickLogWatering(ownerB)).toEqual({ status: "pending", record: b });
  });

  it("accepts a tent destination with no plant and preserves absent optional fields", async () => {
    const pending = record();
    pending.payload = {
      idempotency_key: "tent-water-12345678",
      grow_id: growId,
      tent_id: tentId,
      volume_ml: 600,
    };
    pending.resolved = {
      ok: true,
      targetType: "tent",
      targetId: tentId,
      tentId,
      plantId: null,
      growId,
    };
    expect(await claimPendingQuickLogWatering(pending)).toEqual({
      status: "claimed",
      record: pending,
    });
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "pending", record: pending });
  });

  it("accepts the canonical numeric boundaries without normalizing the payload", async () => {
    const pending = record();
    Object.assign(pending.payload, {
      volume_ml: 1_000_000,
      ph: 0,
      ec_ms_cm: 10,
      runoff_ml: 0,
      runoff_ph: 14,
      runoff_ec: 0,
      water_temp_c: -10,
    });
    pending.payload.sensor_snapshot!.metrics = { temperature_c: 60, humidity_pct: 0, vpd_kpa: 10 };
    expect(await claimPendingQuickLogWatering(pending)).toEqual({
      status: "claimed",
      record: pending,
    });
  });
});

describe("fail-closed pending Water validation", () => {
  it.each([null, undefined, "", " ", " owner "])(
    "blocks an absent or noncanonical owner: %s",
    (owner) => {
      expect(readPendingQuickLogWatering(owner)).toEqual({ status: "blocked" });
    },
  );

  it.each([null, undefined, 0, [], {}])(
    "does not throw for a malformed claim or clear: %j",
    async (input) => {
      expect(await claimPendingQuickLogWatering(input as PendingQuickLogWatering)).toEqual({
        status: "blocked",
      });
      expect(await clearPendingQuickLogWatering(input as PendingQuickLogWatering)).toBe(false);
    },
  );

  it.each(["not json", "null", "[]", "{}"])(
    "retains corrupt storage as blocked: %s",
    async (raw) => {
      window.sessionStorage.setItem(key(), raw);
      expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "blocked" });
      expect(await claimPendingQuickLogWatering(record())).toEqual({ status: "blocked" });
      expect(window.sessionStorage.getItem(key())).toBe(raw);
    },
  );

  const tampered: Array<[string, (value: PendingQuickLogWatering) => void]> = [
    ["unknown version", (r) => Object.assign(r, { version: 2 })],
    [
      "foreign owner",
      (r) => {
        r.ownerId = ownerB;
      },
    ],
    ["unknown top-level key", (r) => Object.assign(r, { extra: true })],
    [
      "invalid created timestamp",
      (r) => {
        r.createdAt = "2026-02-30T00:00:00.000Z";
      },
    ],
    [
      "noncanonical created timestamp",
      (r) => {
        r.createdAt = "2026-09-17";
      },
    ],
    [
      "short key",
      (r) => {
        r.payload.idempotency_key = "short";
      },
    ],
    [
      "overlong key",
      (r) => {
        r.payload.idempotency_key = "x".repeat(201);
      },
    ],
    [
      "normalized-away key whitespace",
      (r) => {
        r.payload.idempotency_key = " watering-key-12345678 ";
      },
    ],
    ["unknown payload key", (r) => Object.assign(r.payload, { user_id: ownerA })],
    [
      "zero volume",
      (r) => {
        r.payload.volume_ml = 0;
      },
    ],
    [
      "excessive volume",
      (r) => {
        r.payload.volume_ml = 1_000_001;
      },
    ],
    ["string number", (r) => Object.assign(r.payload, { ph: "6.3" })],
    [
      "invalid pH",
      (r) => {
        r.payload.ph = 14.01;
      },
    ],
    [
      "invalid EC",
      (r) => {
        r.payload.ec_ms_cm = 10.01;
      },
    ],
    [
      "negative runoff",
      (r) => {
        r.payload.runoff_ml = -1;
      },
    ],
    [
      "invalid runoff pH",
      (r) => {
        r.payload.runoff_ph = -0.01;
      },
    ],
    [
      "invalid runoff EC",
      (r) => {
        r.payload.runoff_ec = 10.01;
      },
    ],
    [
      "invalid water temperature",
      (r) => {
        r.payload.water_temp_c = 60.01;
      },
    ],
    ["nonstrings cannot become an empty note", (r) => Object.assign(r.payload, { note: {} })],
    [
      "oversized note",
      (r) => {
        r.payload.note = "n".repeat(501);
      },
    ],
    [
      "numeric occurrence timestamp",
      (r) => {
        r.payload.occurred_at = 1_800_000_000_000;
      },
    ],
    [
      "invalid occurrence timestamp",
      (r) => {
        r.payload.occurred_at = "yesterday";
      },
    ],
    [
      "live source on manual evidence",
      (r) => Object.assign(r.payload.sensor_snapshot!, { source: "live" }),
    ],
    ["unknown snapshot key", (r) => Object.assign(r.payload.sensor_snapshot!, { live: true })],
    [
      "snapshot timestamp differs",
      (r) => {
        r.payload.sensor_snapshot!.captured_at = "2026-09-17T03:01:00.000Z";
      },
    ],
    [
      "empty snapshot metrics",
      (r) => {
        r.payload.sensor_snapshot!.metrics = {};
      },
    ],
    [
      "unknown snapshot metric",
      (r) => Object.assign(r.payload.sensor_snapshot!.metrics, { soil_pct: 30 }),
    ],
    [
      "invalid air temperature",
      (r) => {
        r.payload.sensor_snapshot!.metrics.temperature_c = -11;
      },
    ],
    [
      "invalid humidity",
      (r) => {
        r.payload.sensor_snapshot!.metrics.humidity_pct = 101;
      },
    ],
    [
      "invalid VPD",
      (r) => {
        r.payload.sensor_snapshot!.metrics.vpd_kpa = -0.1;
      },
    ],
    [
      "ownership fields in details",
      (r) => {
        r.payload.details!.user_id = ownerA;
      },
    ],
    [
      "oversized details",
      (r) => {
        r.payload.details = { text: "d".repeat(20_001) };
      },
    ],
    [
      "manual observation source changed",
      (r) =>
        Object.assign(r.payload.details!.root_zone_manual_observation_v1 as object, {
          source: "live",
        }),
    ],
    [
      "resolved target not ready",
      (r) => {
        r.resolved.ok = false;
      },
    ],
    ["unknown resolved key", (r) => Object.assign(r.resolved, { extra: true })],
    [
      "grow mismatch",
      (r) => {
        r.resolved.growId = "different-grow";
      },
    ],
    [
      "tent mismatch",
      (r) => {
        r.resolved.tentId = "different-tent";
      },
    ],
    [
      "plant mismatch",
      (r) => {
        r.resolved.plantId = "different-plant";
      },
    ],
    [
      "target mismatch",
      (r) => {
        r.resolved.targetId = "different-target";
      },
    ],
    [
      "plant target without matching plantId",
      (r) => {
        r.resolved.targetType = "plant";
        r.resolved.plantId = "different-plant";
        r.resolved.targetId = "different-plant";
      },
    ],
    [
      "tent target with a non-null plantId",
      (r) => {
        r.resolved.targetType = "tent";
        r.resolved.targetId = tentId;
        r.resolved.tentId = tentId;
        r.resolved.plantId = "plant-a";
        r.payload.plant_id = null;
      },
    ],
    ["attachment intentions not boolean", (r) => Object.assign(r.attachments, { photo: "yes" })],
    [
      "file metadata hidden in attachments",
      (r) => Object.assign(r.attachments, { photoUrl: "private-photo" }),
    ],
  ];
  it.each(tampered)("blocks a corrupt stored record: %s", async (_label, mutate) => {
    const input = record();
    mutate(input);
    window.sessionStorage.setItem(key(), JSON.stringify(input));
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "blocked" });
    expect(await clearPendingQuickLogWatering(input)).toBe(false);
  });

  it.each([
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["undefined", undefined],
    ["function", () => "silently lost"],
    ["Date", new Date(observedAt)],
  ])("blocks a claim whose details cannot survive JSON exactly: %s", async (_label, value) => {
    const input = record();
    input.payload.details!.bad = value;
    expect(await claimPendingQuickLogWatering(input)).toEqual({ status: "blocked" });
    expect(window.sessionStorage.getItem(key())).toBeNull();
  });

  it("blocks cyclic details without throwing or discarding them", async () => {
    const input = record();
    input.payload.details!.self = input.payload.details;
    expect(await claimPendingQuickLogWatering(input)).toEqual({ status: "blocked" });
    expect(window.sessionStorage.getItem(key())).toBeNull();
  });
});

describe("storage failures and exact completion", () => {
  it("blocks when even accessing sessionStorage throws", async () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("disabled");
    });
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "blocked" });
    expect(await claimPendingQuickLogWatering(record())).toEqual({ status: "blocked" });
    expect(await clearPendingQuickLogWatering(record())).toBe(false);
  });

  it.each(["throw", "no-op"])(
    "does not permit dispatch after a %s storage write",
    async (failure) => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        if (failure === "throw") throw new Error("quota");
      });
      expect(await claimPendingQuickLogWatering(record())).toEqual({ status: "blocked" });
      expect(window.sessionStorage.getItem(key())).toBeNull();
    },
  );

  it("blocks a claim if the persisted readback is not the requested record", async () => {
    const originalSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      name,
      _value,
    ) {
      originalSet.call(this, name, "{}");
    });
    expect(await claimPendingQuickLogWatering(record())).toEqual({ status: "blocked" });
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "blocked" });
  });

  it("clears only an exact completed claim, then permits a new logical save", async () => {
    const original = record();
    expect((await claimPendingQuickLogWatering(original)).status).toBe("claimed");
    const edited = record();
    edited.payload.volume_ml = 900;
    expect(await clearPendingQuickLogWatering(edited)).toBe(false);
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "pending", record: original });
    expect(await clearPendingQuickLogWatering(original)).toBe(true);
    expect(await clearPendingQuickLogWatering(original)).toBe(false);
    expect(await claimPendingQuickLogWatering(edited)).toEqual({
      status: "claimed",
      record: edited,
    });
    expect(await clearPendingQuickLogWatering(original)).toBe(false);
  });

  it.each(["throw", "no-op"])("reports failed cleanup when removeItem is %s", async (failure) => {
    const input = record();
    expect((await claimPendingQuickLogWatering(input)).status).toBe("claimed");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      if (failure === "throw") throw new Error("disabled");
    });
    expect(await clearPendingQuickLogWatering(input)).toBe(false);
    expect(readPendingQuickLogWatering(ownerA)).toEqual({ status: "pending", record: input });
  });
});
