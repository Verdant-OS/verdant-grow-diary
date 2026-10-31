/**
 * Regression guards for PR #2117: `updatePendingQuickLogNotePayload` must fail
 * closed when sessionStorage read-back does not match the photo-bearing payload
 * (stale journal → idempotency hash mismatch on retry).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingQuickLogNote,
  updatePendingQuickLogNotePayload,
  type PendingQuickLogNote,
} from "@/lib/quickLogPendingNoteStore";

const ownerA = "11111111-1111-4111-8111-111111111111";
const plantId = "33333333-3333-4333-8333-333333333333";
const tentId = "55555555-5555-4555-8555-555555555555";
const growId = "66666666-6666-4666-8666-666666666666";

function pendingKey(ownerId = ownerA): string {
  return `verdant:quick-log:pending-note:v1:${ownerId}`;
}

function validRecord(overrides: Partial<PendingQuickLogNote> = {}): PendingQuickLogNote {
  return {
    version: 1,
    ownerId: ownerA,
    createdAt: "2026-09-01T12:00:00.000Z",
    payload: {
      p_target_type: "plant",
      p_target_id: plantId,
      p_action: "note",
      p_volume_ml: null,
      p_note: "Unresolved note draft",
      p_temperature_c: 25,
      p_humidity_pct: 60,
      p_vpd_kpa: 1.2,
      p_occurred_at: "2026-09-01T12:00:00.000Z",
      p_details: { source: "manual" },
      p_stage: "flower",
      p_idempotency_key: "durable-note-key-12345678",
    },
    resolved: {
      ok: true,
      targetType: "plant",
      targetId: plantId,
      plantId,
      tentId,
      growId,
    },
    attachments: { photo: false, video: false },
    ...overrides,
  };
}

describe("updatePendingQuickLogNotePayload — read-back verification", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("reports blocked when read-back after setItem does not match the photo-bearing payload", () => {
    const record = validRecord({ attachments: { photo: true, video: false } });
    claimPendingQuickLogNote(record);
    const key = pendingKey();
    const originalSetItem = Storage.prototype.setItem.bind(window.sessionStorage);
    const originalGetItem = Storage.prototype.getItem.bind(window.sessionStorage);
    let sabotageVerify = false;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      name: string,
      value: string,
    ) {
      originalSetItem.call(this, name, value);
      if (name === key && value.includes("photo_url")) sabotageVerify = true;
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      name: string,
    ) {
      if (name === key && sabotageVerify) {
        sabotageVerify = false;
        return JSON.stringify(record);
      }
      return originalGetItem.call(this, name);
    });
    expect(
      updatePendingQuickLogNotePayload(record, {
        ...record.payload,
        p_details: { source: "manual", photo_url: "grow/leaf.jpg" },
      }),
    ).toEqual({ status: "blocked" });
    vi.restoreAllMocks();
    // setItem runs before verify; a failed verify does not roll back the journal.
    const stored = JSON.parse(window.sessionStorage.getItem(key)!) as PendingQuickLogNote;
    expect(stored.payload.p_details?.photo_url).toBe("grow/leaf.jpg");
  });
});
