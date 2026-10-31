import { describe, expect, it } from "vitest";
import {
  ARCHIVED_GROW_QUICK_LOG_BLOCKED_COPY,
  growRestoreFailureCopy,
  isArchivedGrowId,
  isArchivedGrowNoteActivity,
  isArchivedGrowQuickLogNote,
  nextStoredActiveGrowIdForNamedGrow,
  planGrowRestore,
  quickLogArchivedGrowActionBlock,
  resolveArchivedGrowQuickLogLaunch,
} from "@/lib/archivedGrowQuickLogRules";
import { FREE_GROW_LIMIT_BLOCKED_COPY } from "@/lib/entitlements/freeTierGates";

const ARCHIVED = "grow-archived";
const ACTIVE = "grow-active";
const STORED = ACTIVE;

const plants = [
  { id: "plant-old", name: "Old plant", grow_id: ARCHIVED, tent_id: "tent-old" },
  { id: "plant-new", name: "New plant", grow_id: ACTIVE, tent_id: "tent-new" },
];
const tents = [
  { id: "tent-old", name: "Old tent", grow_id: ARCHIVED },
  { id: "tent-new", name: "New tent", grow_id: ACTIVE },
];

describe("archived grow note gate", () => {
  it("stops a non-note activity even when the event type is omitted", () => {
    const launch = resolveArchivedGrowQuickLogLaunch({
      storedActiveGrowId: STORED,
      prefill: { plantId: "plant-old", growId: ARCHIVED, tentId: "tent-old" },
      plants,
      tents,
      archivedGrowIds: [ARCHIVED],
      activityId: "watering",
    });

    expect(launch.confirming).toBe(false);
    expect(launch.resolution).toEqual({ status: "blocked", reason: "grow_archived" });
    expect(launch.nextStoredActiveGrowId).toBe(STORED);
    expect(isArchivedGrowQuickLogNote({ activityId: "watering" })).toBe(false);
    expect(isArchivedGrowQuickLogNote({ activityId: "note", eventType: "watering" })).toBe(false);
    expect(isArchivedGrowQuickLogNote({ activityId: " PHOTO " })).toBe(true);
    expect(isArchivedGrowNoteActivity(" Photo ")).toBe(true);
    expect(isArchivedGrowNoteActivity("issue_observation")).toBe(true);
    expect(isArchivedGrowNoteActivity("feeding")).toBe(false);
    expect(isArchivedGrowNoteActivity(null)).toBe(false);
  });

  it.each([null, "", "photo", "environment"] as const)(
    "blocks archived-grow action %s",
    (action) => {
      expect(
        quickLogArchivedGrowActionBlock({
          growId: ARCHIVED,
          action,
          archivedGrowIds: [ARCHIVED],
        }),
      ).toBe(ARCHIVED_GROW_QUICK_LOG_BLOCKED_COPY);
    },
  );

  it("still blocks a padded archived grow id", () => {
    expect(
      quickLogArchivedGrowActionBlock({
        growId: ` ${ARCHIVED} `,
        action: "water",
        archivedGrowIds: [ARCHIVED],
      }),
    ).toBe(ARCHIVED_GROW_QUICK_LOG_BLOCKED_COPY);
  });
});

describe("stored active grow id", () => {
  it("moves the stored grow only for a named grow that is still active", () => {
    expect(isArchivedGrowId(` ${ARCHIVED} `, [ARCHIVED])).toBe(true);
    expect(isArchivedGrowId("", [ARCHIVED])).toBe(false);
    expect(isArchivedGrowId(null, [ARCHIVED])).toBe(false);
    expect(isArchivedGrowId(1 as unknown as string, new Set([ARCHIVED]))).toBe(false);

    expect(
      nextStoredActiveGrowIdForNamedGrow({
        storedActiveGrowId: "grow-previous",
        requestedGrowId: ` ${ACTIVE} `,
        archivedGrowIds: [ARCHIVED],
      }),
    ).toBe(ACTIVE);
    expect(
      nextStoredActiveGrowIdForNamedGrow({
        storedActiveGrowId: STORED,
        requestedGrowId: "   ",
        archivedGrowIds: [ARCHIVED],
      }),
    ).toBe(STORED);
    expect(
      nextStoredActiveGrowIdForNamedGrow({
        storedActiveGrowId: STORED,
        requestedGrowId: ARCHIVED,
        archivedGrowIds: new Set([ARCHIVED]),
      }),
    ).toBe(STORED);

    const launch = resolveArchivedGrowQuickLogLaunch({
      storedActiveGrowId: "grow-previous",
      prefill: { plantId: "plant-new", growId: ACTIVE, tentId: "tent-new" },
      plants,
      tents,
      archivedGrowIds: [ARCHIVED],
      eventType: "watering",
    });
    expect(launch.resolution).toEqual({ status: "blocked", reason: "prefill_target_pending" });
    expect(launch.confirming).toBe(true);
    expect(launch.nextStoredActiveGrowId).toBe(ACTIVE);
  });
});

describe("restore grow failure copy", () => {
  it("maps a cap code in code or details onto the free-tier message", () => {
    expect(growRestoreFailureCopy(null)).toBe("Unable to restore this grow. Please try again.");
    expect(
      growRestoreFailureCopy({
        code: "free_active_grow_limit_reached",
        message: "conflict",
      }),
    ).toBe(FREE_GROW_LIMIT_BLOCKED_COPY);
    expect(
      growRestoreFailureCopy({
        details: "free_active_grow_limit_reached",
        message: "conflict",
      }),
    ).toBe(FREE_GROW_LIMIT_BLOCKED_COPY);
  });

  it("uses the free-tier copy when a blocked restore has no caller message", () => {
    expect(planGrowRestore({ allowed: false, blockedCopy: null })).toEqual({
      proceed: false,
      errorCopy: FREE_GROW_LIMIT_BLOCKED_COPY,
    });
    expect(planGrowRestore({ allowed: true, blockedCopy: FREE_GROW_LIMIT_BLOCKED_COPY })).toEqual({
      proceed: true,
      errorCopy: null,
    });
  });
});
