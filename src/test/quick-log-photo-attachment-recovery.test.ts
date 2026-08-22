import { beforeEach, describe, expect, it } from "vitest";

import {
  QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_STORAGE_KEY,
  clearQuickLogPhotoAttachmentRecoveryLock,
  getQuickLogPhotoAttachmentRecoveryRecord,
  hasQuickLogPhotoAttachmentRecoveryLock,
  recordQuickLogPhotoAttachmentRecoveryLock,
  type QuickLogPhotoAttachmentRecoveryScope,
} from "@/lib/quickLogPhotoAttachmentRecovery";

const ORIGINAL_SCOPE: QuickLogPhotoAttachmentRecoveryScope = {
  ownerId: "owner-a",
  growId: "grow-a",
  tentId: "tent-a",
  plantId: "plant-a",
};

beforeEach(() => {
  window.sessionStorage.removeItem(QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_STORAGE_KEY);
});

describe("Quick Log photo attachment recovery fence", () => {
  it("persists only for the exact owner/grow/tent/plant photo-insert scope", () => {
    expect(recordQuickLogPhotoAttachmentRecoveryLock(ORIGINAL_SCOPE)).not.toBeNull();
    expect(hasQuickLogPhotoAttachmentRecoveryLock(ORIGINAL_SCOPE)).toBe(true);
    expect(hasQuickLogPhotoAttachmentRecoveryLock({ ...ORIGINAL_SCOPE, ownerId: "owner-b" })).toBe(
      false,
    );
    expect(hasQuickLogPhotoAttachmentRecoveryLock({ ...ORIGINAL_SCOPE, growId: "grow-b" })).toBe(
      false,
    );
    expect(hasQuickLogPhotoAttachmentRecoveryLock({ ...ORIGINAL_SCOPE, tentId: "tent-b" })).toBe(
      false,
    );
    expect(hasQuickLogPhotoAttachmentRecoveryLock({ ...ORIGINAL_SCOPE, plantId: "plant-b" })).toBe(
      false,
    );
  });

  it("clears only an explicitly recovered exact scope", () => {
    const otherPlant = { ...ORIGINAL_SCOPE, plantId: "plant-b" };
    recordQuickLogPhotoAttachmentRecoveryLock(ORIGINAL_SCOPE);
    recordQuickLogPhotoAttachmentRecoveryLock(otherPlant);

    clearQuickLogPhotoAttachmentRecoveryLock(ORIGINAL_SCOPE);

    expect(hasQuickLogPhotoAttachmentRecoveryLock(ORIGINAL_SCOPE)).toBe(false);
    expect(hasQuickLogPhotoAttachmentRecoveryLock(otherPlant)).toBe(true);
  });

  it("keeps the exact opaque diary attempt available for owner-scoped recovery", () => {
    const diaryEntryId = "00000000-0000-4000-8000-000000000555";

    recordQuickLogPhotoAttachmentRecoveryLock(ORIGINAL_SCOPE, diaryEntryId);

    // The application never renders this value; it is retained only so a
    // later owner-scoped exact-row lookup can prove that clearing is safe.
    expect(getQuickLogPhotoAttachmentRecoveryRecord(ORIGINAL_SCOPE)).toEqual({ diaryEntryId });
    expect(hasQuickLogPhotoAttachmentRecoveryLock(ORIGINAL_SCOPE)).toBe(true);
  });

  it("does not create a recovery record without the authenticated owner and grow", () => {
    expect(
      recordQuickLogPhotoAttachmentRecoveryLock({ ...ORIGINAL_SCOPE, ownerId: null }),
    ).toBeNull();
    expect(
      recordQuickLogPhotoAttachmentRecoveryLock({ ...ORIGINAL_SCOPE, growId: " " }),
    ).toBeNull();
    expect(
      window.sessionStorage.getItem(QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_STORAGE_KEY),
    ).toBeNull();
  });

  it("keeps an older scope-only record locked rather than clearing it on upgrade", () => {
    const legacyKey = JSON.stringify([
      "photo_diary_insert",
      "owner-a",
      "grow-a",
      "tent-a",
      "plant-a",
    ]);
    window.sessionStorage.setItem(
      QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_STORAGE_KEY,
      JSON.stringify({ version: 1, locks: [legacyKey] }),
    );

    expect(hasQuickLogPhotoAttachmentRecoveryLock(ORIGINAL_SCOPE)).toBe(true);
    expect(getQuickLogPhotoAttachmentRecoveryRecord(ORIGINAL_SCOPE)).toEqual({
      diaryEntryId: null,
    });
  });
});
