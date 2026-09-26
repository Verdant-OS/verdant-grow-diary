import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingQuickLogActivity,
  clearPendingQuickLogActivity,
  readConfirmedPendingQuickLogActivity,
  readPendingQuickLogActivity,
  readRejectedPendingQuickLogActivity,
  rememberConfirmedPendingQuickLogActivity,
  rememberRejectedPendingQuickLogActivity,
  type PendingQuickLogActivity,
} from "@/lib/quickLogPendingActivityStore";
import { buildQuickLogRecoveryScopeKey } from "@/lib/quickLogActivityRules";

const original: PendingQuickLogActivity = {
  version: 1,
  ownerId: "owner-a",
  createdAt: "2026-09-26T00:00:00.000Z",
  input: {
    activityId: "training",
    growId: "grow-a",
    tentId: "tent-a",
    plantId: "plant-a",
    note: "Observed training",
    occurredAt: "2026-09-26T00:00:00.000Z",
    extraDetails: { technique: "topping" },
    idempotencyKey: "activity-attempt-a",
  },
  receipt: { symptomCheck: false, harvestDetails: null },
};

beforeEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("pending Quick Log activity recovery", () => {
  it("uses a deterministic null-safe recovery scope that follows a plant across tents", () => {
    const moved = { growId: "grow-b", tentId: "tent-b", plantId: "plant-a" };
    expect(buildQuickLogRecoveryScopeKey(original.input)).toBe(
      buildQuickLogRecoveryScopeKey(moved),
    );
    expect(buildQuickLogRecoveryScopeKey(moved)).toBe(buildQuickLogRecoveryScopeKey(moved));
    expect(buildQuickLogRecoveryScopeKey(null)).toBe('["grow",null]');
    expect(buildQuickLogRecoveryScopeKey(undefined)).toBe('["grow",null]');
    expect(buildQuickLogRecoveryScopeKey({ ...moved, plantId: "plant-b" })).not.toBe(
      buildQuickLogRecoveryScopeKey(moved),
    );
  });

  it("keeps the exact unresolved plant request visible after a tent and grow move", () => {
    const moved = { growId: "grow-b", tentId: "tent-b", plantId: "plant-a" };
    expect(claimPendingQuickLogActivity(original)).toEqual({ status: "claimed", record: original });
    expect(readPendingQuickLogActivity(original.ownerId, moved)).toEqual({
      status: "pending",
      record: original,
    });
    const replacement = {
      ...original,
      input: { ...original.input, ...moved, idempotencyKey: "activity-after-move" },
    };
    expect(claimPendingQuickLogActivity(replacement)).toEqual({
      status: "pending",
      record: original,
    });
    expect(clearPendingQuickLogActivity(original)).toBe(true);
    expect(readPendingQuickLogActivity(original.ownerId, moved)).toEqual({ status: "empty" });
  });

  it("upgrades a legacy v1 record without changing its null occurrence-time RPC value", () => {
    expect(claimPendingQuickLogActivity(original).status).toBe("claimed");
    const key = window.sessionStorage.key(0)!;
    const legacy = structuredClone(original) as unknown as Record<string, unknown>;
    delete (legacy.input as Record<string, unknown>).occurredAt;
    window.sessionStorage.setItem(key, JSON.stringify(legacy));
    const legacyRequest = { ...original, input: { ...original.input, occurredAt: null } };
    expect(readPendingQuickLogActivity(original.ownerId, original.input)).toEqual({
      status: "pending",
      record: legacyRequest,
    });
    expect(JSON.parse(window.sessionStorage.getItem(key)!)).toEqual(legacyRequest);
    expect(readPendingQuickLogActivity(original.ownerId, original.input)).toEqual({
      status: "pending",
      record: legacyRequest,
    });
  });

  it("keeps a legacy record blocked when its upgrade cannot be written back", () => {
    expect(claimPendingQuickLogActivity(original).status).toBe("claimed");
    const key = window.sessionStorage.key(0)!;
    const legacy = structuredClone(original) as unknown as Record<string, unknown>;
    delete (legacy.input as Record<string, unknown>).occurredAt;
    window.sessionStorage.setItem(key, JSON.stringify(legacy));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => undefined);
    expect(readPendingQuickLogActivity(original.ownerId, original.input)).toEqual({
      status: "blocked",
    });
    expect(JSON.parse(window.sessionStorage.getItem(key)!)).toEqual(legacy);
  });

  it("claims and reads one exact payload without allowing an edited attempt to replace it", () => {
    expect(claimPendingQuickLogActivity(original)).toEqual({ status: "claimed", record: original });
    expect(readPendingQuickLogActivity(original.ownerId, original.input)).toEqual({
      status: "pending",
      record: original,
    });
    expect(claimPendingQuickLogActivity(original)).toEqual({ status: "claimed", record: original });
    const edited: PendingQuickLogActivity = {
      ...original,
      input: { ...original.input, note: "Edited", idempotencyKey: "activity-attempt-b" },
    };
    expect(claimPendingQuickLogActivity(edited)).toEqual({ status: "pending", record: original });
    expect(readPendingQuickLogActivity(original.ownerId, original.input)).toEqual({
      status: "pending",
      record: original,
    });
  });

  it("rejects an occurrence time that differs from the captured submission", () => {
    expect(
      claimPendingQuickLogActivity({
        ...original,
        input: { ...original.input, occurredAt: "2026-09-26T01:00:00.000Z" },
      }),
    ).toEqual({ status: "blocked" });
  });

  it("keeps another target and owner independent while the first is unresolved", () => {
    const otherTarget: PendingQuickLogActivity = {
      ...original,
      input: { ...original.input, plantId: "plant-b", idempotencyKey: "activity-attempt-b" },
    };
    const otherOwner: PendingQuickLogActivity = {
      ...original,
      ownerId: "owner-b",
      input: { ...original.input, idempotencyKey: "activity-attempt-c" },
    };
    expect(claimPendingQuickLogActivity(original).status).toBe("claimed");
    expect(claimPendingQuickLogActivity(otherTarget).status).toBe("claimed");
    expect(claimPendingQuickLogActivity(otherOwner).status).toBe("claimed");
    expect(readPendingQuickLogActivity("owner-a", otherTarget.input)).toEqual({
      status: "pending",
      record: otherTarget,
    });
    expect(readPendingQuickLogActivity("owner-b", original.input)).toEqual({
      status: "pending",
      record: otherOwner,
    });
  });

  it("clears only the unchanged record after confirmation", () => {
    expect(claimPendingQuickLogActivity(original).status).toBe("claimed");
    expect(
      clearPendingQuickLogActivity({ ...original, input: { ...original.input, note: "Edited" } }),
    ).toBe(false);
    expect(readPendingQuickLogActivity(original.ownerId, original.input).status).toBe("pending");
    expect(clearPendingQuickLogActivity(original)).toBe(true);
    expect(readPendingQuickLogActivity(original.ownerId, original.input)).toEqual({
      status: "empty",
    });
  });

  it("keeps an uncleared confirmation scoped to the exact record until cleanup succeeds", () => {
    expect(claimPendingQuickLogActivity(original).status).toBe("claimed");
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => undefined);
    expect(clearPendingQuickLogActivity(original)).toBe(false);
    rememberConfirmedPendingQuickLogActivity(original, "77777777-7777-4777-8777-000000000001");
    expect(readConfirmedPendingQuickLogActivity(original)).toEqual({
      growEventId: "77777777-7777-4777-8777-000000000001",
    });
    expect(
      readConfirmedPendingQuickLogActivity({
        ...original,
        input: { ...original.input, note: "Different payload" },
      }),
    ).toBeNull();
    remove.mockRestore();
    expect(clearPendingQuickLogActivity(original)).toBe(true);
    expect(readConfirmedPendingQuickLogActivity(original)).toBeNull();
  });

  it("keeps an uncleared definitive rejection distinct from a confirmed save", () => {
    expect(claimPendingQuickLogActivity(original).status).toBe("claimed");
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => undefined);
    rememberRejectedPendingQuickLogActivity(original);
    expect(readRejectedPendingQuickLogActivity(original)).toBe(true);
    expect(readConfirmedPendingQuickLogActivity(original)).toBeNull();
    expect(
      readRejectedPendingQuickLogActivity({
        ...original,
        input: { ...original.input, note: "Different payload" },
      }),
    ).toBe(false);
    expect(clearPendingQuickLogActivity(original)).toBe(false);
    remove.mockRestore();
    expect(clearPendingQuickLogActivity(original)).toBe(true);
    expect(readRejectedPendingQuickLogActivity(original)).toBe(false);
  });

  it("restores a definitive rejection after a page-like module reload without replaying it", async () => {
    expect(claimPendingQuickLogActivity(original).status).toBe("claimed");
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => undefined);
    expect(clearPendingQuickLogActivity(original)).toBe(false);
    rememberRejectedPendingQuickLogActivity(original);
    expect(window.sessionStorage.length).toBe(2);

    vi.resetModules();
    const reloaded = await import("@/lib/quickLogPendingActivityStore");
    expect(reloaded.readPendingQuickLogActivity(original.ownerId, original.input).status).toBe(
      "pending",
    );
    expect(reloaded.readRejectedPendingQuickLogActivity(original)).toBe(true);
    expect(reloaded.readConfirmedPendingQuickLogActivity(original)).toBeNull();
    remove.mockRestore();
    expect(reloaded.clearPendingQuickLogActivity(original)).toBe(true);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("restores a confirmed outcome after reload and blocks a mismatched outcome marker", async () => {
    expect(claimPendingQuickLogActivity(original).status).toBe("claimed");
    rememberConfirmedPendingQuickLogActivity(original, "77777777-7777-4777-8777-000000000001");
    vi.resetModules();
    const reloaded = await import("@/lib/quickLogPendingActivityStore");
    expect(reloaded.readConfirmedPendingQuickLogActivity(original)).toEqual({
      growEventId: "77777777-7777-4777-8777-000000000001",
    });
    const markerKey = Object.keys(window.sessionStorage).find((key) =>
      key.startsWith("verdant:quick-log:resolved-activity:v1:"),
    );
    expect(markerKey).toBeDefined();
    window.sessionStorage.setItem(
      markerKey!,
      JSON.stringify({ record: "wrong", outcome: { kind: "rejected" } }),
    );
    expect(reloaded.readPendingQuickLogActivity(original.ownerId, original.input)).toEqual({
      status: "blocked",
    });
  });

  it("fails closed for missing identity, corrupt storage, and a no-op storage write", () => {
    expect(readPendingQuickLogActivity(null, original.input)).toEqual({ status: "blocked" });
    expect(readPendingQuickLogActivity(original.ownerId, null)).toEqual({ status: "blocked" });
    expect(claimPendingQuickLogActivity(original).status).toBe("claimed");
    const key = window.sessionStorage.key(0);
    expect(key).not.toBeNull();
    window.sessionStorage.setItem(key!, "{not json");
    expect(readPendingQuickLogActivity(original.ownerId, original.input)).toEqual({
      status: "blocked",
    });
    expect(claimPendingQuickLogActivity(original).status).toBe("blocked");
    window.sessionStorage.clear();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => undefined);
    expect(claimPendingQuickLogActivity(original).status).toBe("blocked");
  });
});
