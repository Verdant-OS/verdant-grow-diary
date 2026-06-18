/**
 * Tests for diaryEntryRemovalRules — pure eligibility + copy.
 */
import { describe, it, expect } from "vitest";
import {
  REMOVE_LOG_BUTTON_LABEL,
  REMOVE_PHOTO_LOG_BUTTON_LABEL,
  REMOVE_LOG_DIALOG_TITLE,
  REMOVE_LOG_DIALOG_BODY,
  REMOVE_PHOTO_LOG_DIALOG_EXTRA,
  REMOVE_LOG_DIALOG_CANCEL,
  REMOVE_LOG_DIALOG_CONFIRM,
  REMOVE_LOG_SUCCESS_TOAST,
  REMOVE_PHOTO_LOG_SUCCESS_TOAST,
  REMOVE_LOG_ERROR_TOAST,
  canRemoveDiaryEntry,
  isPhotoLogEntry,
  getRemoveButtonLabel,
  getRemoveSuccessToast,
  getRemoveButtonAriaLabel,
} from "@/lib/diaryEntryRemovalRules";

const VIEWER = { currentUserId: "user-1" } as const;

describe("canRemoveDiaryEntry", () => {
  it("allows owner to remove a normal diary entry", () => {
    expect(
      canRemoveDiaryEntry(
        { id: "e1", ownerUserId: "user-1", kind: "diary" },
        VIEWER,
      ),
    ).toBe(true);
  });

  it("allows owner to remove a photo log entry", () => {
    expect(
      canRemoveDiaryEntry(
        { id: "e1", ownerUserId: "user-1", photoUrl: "x.jpg", kind: "diary" },
        VIEWER,
      ),
    ).toBe(true);
  });

  it("rejects sensor readings", () => {
    expect(
      canRemoveDiaryEntry({ id: "s1", kind: "sensor_reading" }, VIEWER),
    ).toBe(false);
  });

  it("rejects imported telemetry", () => {
    expect(
      canRemoveDiaryEntry({ id: "i1", kind: "imported_telemetry" }, VIEWER),
    ).toBe(false);
  });

  it("rejects in customer / public mode", () => {
    expect(
      canRemoveDiaryEntry(
        { id: "e1", kind: "diary" },
        { currentUserId: "user-1", isCustomerOrPublicMode: true },
      ),
    ).toBe(false);
  });

  it("rejects in read-only report view", () => {
    expect(
      canRemoveDiaryEntry(
        { id: "e1", kind: "diary" },
        { currentUserId: "user-1", isReadOnlyReportView: true },
      ),
    ).toBe(false);
  });

  it("rejects when not signed in", () => {
    expect(
      canRemoveDiaryEntry(
        { id: "e1", kind: "diary" },
        { currentUserId: null },
      ),
    ).toBe(false);
  });

  it("rejects when owner mismatch is known", () => {
    expect(
      canRemoveDiaryEntry(
        { id: "e1", ownerUserId: "other-user", kind: "diary" },
        VIEWER,
      ),
    ).toBe(false);
  });

  it("rejects null/undefined and missing id", () => {
    expect(canRemoveDiaryEntry(null, VIEWER)).toBe(false);
    expect(canRemoveDiaryEntry(undefined, VIEWER)).toBe(false);
    expect(canRemoveDiaryEntry({ id: "" }, VIEWER)).toBe(false);
  });
});

describe("isPhotoLogEntry", () => {
  it("true when photo_url is a non-empty string", () => {
    expect(isPhotoLogEntry({ photoUrl: "https://x/y.jpg" })).toBe(true);
  });
  it("false when photo_url is empty/whitespace/null/undefined", () => {
    expect(isPhotoLogEntry({ photoUrl: "" })).toBe(false);
    expect(isPhotoLogEntry({ photoUrl: "   " })).toBe(false);
    expect(isPhotoLogEntry({ photoUrl: null })).toBe(false);
    expect(isPhotoLogEntry({})).toBe(false);
    expect(isPhotoLogEntry(null)).toBe(false);
  });
});

describe("label/toast variants", () => {
  it("button label switches by photo flag", () => {
    expect(getRemoveButtonLabel(false)).toBe(REMOVE_LOG_BUTTON_LABEL);
    expect(getRemoveButtonLabel(true)).toBe(REMOVE_PHOTO_LOG_BUTTON_LABEL);
  });
  it("success toast switches by photo flag", () => {
    expect(getRemoveSuccessToast(false)).toBe(REMOVE_LOG_SUCCESS_TOAST);
    expect(getRemoveSuccessToast(true)).toBe(REMOVE_PHOTO_LOG_SUCCESS_TOAST);
  });
  it("aria-label includes plant name when present", () => {
    expect(getRemoveButtonAriaLabel(false, "Plant A")).toBe(
      "Remove log for Plant A",
    );
    expect(getRemoveButtonAriaLabel(true, "  Plant B  ")).toBe(
      "Remove photo log for Plant B",
    );
    expect(getRemoveButtonAriaLabel(false, "")).toBe("Remove log");
    expect(getRemoveButtonAriaLabel(true, null)).toBe("Remove photo log");
  });
});

describe("required safety copy", () => {
  it("dialog wording matches spec verbatim", () => {
    expect(REMOVE_LOG_DIALOG_TITLE).toBe("Remove this log?");
    expect(REMOVE_LOG_DIALOG_BODY).toBe(
      "This removes the log from this plant's timeline. Use this only when it was added to the wrong plant or strain.",
    );
    expect(REMOVE_PHOTO_LOG_DIALOG_EXTRA).toBe(
      "The photo log will no longer appear in this plant's timeline.",
    );
    expect(REMOVE_LOG_DIALOG_CANCEL).toBe("Cancel");
    expect(REMOVE_LOG_DIALOG_CONFIRM).toBe("Remove log");
  });
  it("error toast never echoes raw DB internals", () => {
    expect(REMOVE_LOG_ERROR_TOAST).toBe(
      "Couldn't remove this log. Please try again.",
    );
    expect(REMOVE_LOG_ERROR_TOAST.toLowerCase()).not.toMatch(
      /sql|postgres|constraint|rls|policy|bucket|storage|token/,
    );
  });
});
