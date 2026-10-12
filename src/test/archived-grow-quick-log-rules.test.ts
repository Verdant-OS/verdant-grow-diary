import { describe, expect, it } from "vitest";

import {
  ARCHIVED_GROW_QUICK_LOG_BLOCKED_COPY,
  growRestoreFailureCopy,
  isArchivedGrowQuickLogNote,
  partitionGrowsByArchive,
  planGrowRestore,
  quickLogArchivedGrowActionBlock,
  resolveArchivedGrowQuickLogLaunch,
} from "@/lib/archivedGrowQuickLogRules";
import { buildQuickLogV2TargetOptions } from "@/lib/quickLogV2Rules";
import { FREE_GROW_LIMIT_BLOCKED_COPY } from "@/lib/entitlements/freeTierGates";
import { QUICK_LOG_TARGET_BLOCKED_COPY } from "@/lib/quickLogTargetIntegrityRules";

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

describe("archived grow Quick Log launch", () => {
  it("reaches a final note target in one call without confirming or changing the stored grow", () => {
    const launch = resolveArchivedGrowQuickLogLaunch({
      storedActiveGrowId: STORED,
      prefill: { plantId: "plant-old", growId: ARCHIVED, tentId: "tent-old" },
      plants,
      tents,
      archivedGrowIds: [ARCHIVED],
      eventType: "observation",
    });

    expect(launch.confirming).toBe(false);
    expect(launch.resolution.status).toBe("ready");
    if (launch.resolution.status !== "ready") throw new Error("expected a ready note target");
    expect(launch.resolution.target).toEqual({
      plantId: "plant-old",
      growId: ARCHIVED,
      tentId: "tent-old",
    });
    expect(launch.nextStoredActiveGrowId).toBe(STORED);
    expect(QUICK_LOG_TARGET_BLOCKED_COPY.prefill_target_pending).toContain("Confirming");
  });

  it("lets a note, photo, or issue observation target the archived-grow plant", () => {
    for (const eventType of ["note", "photo", "observation"] as const) {
      const launch = resolveArchivedGrowQuickLogLaunch({
        storedActiveGrowId: STORED,
        prefill: { plantId: "plant-old", growId: ARCHIVED, tentId: "tent-old" },
        plants,
        tents,
        archivedGrowIds: [ARCHIVED],
        eventType,
      });
      expect(launch.resolution).toMatchObject({
        status: "ready",
        target: { plantId: "plant-old", growId: ARCHIVED },
      });
      expect(launch.nextStoredActiveGrowId).toBe(STORED);
    }

    const issue = resolveArchivedGrowQuickLogLaunch({
      storedActiveGrowId: STORED,
      prefill: { plantId: "plant-old", growId: ARCHIVED, tentId: "tent-old" },
      plants,
      tents,
      archivedGrowIds: [ARCHIVED],
      activityId: "issue_observation",
    });
    expect(issue.resolution.status).toBe("ready");
    expect(isArchivedGrowQuickLogNote({ eventType: null, activityId: "note" })).toBe(true);
  });

  it("stops a non-note with a final archived-grow message and leaves the stored grow", () => {
    const launch = resolveArchivedGrowQuickLogLaunch({
      storedActiveGrowId: STORED,
      prefill: { plantId: "plant-old", growId: ARCHIVED, tentId: "tent-old" },
      plants,
      tents,
      archivedGrowIds: [ARCHIVED],
      eventType: "watering",
    });

    expect(launch.confirming).toBe(false);
    expect(launch.resolution).toEqual({ status: "blocked", reason: "grow_archived" });
    expect(ARCHIVED_GROW_QUICK_LOG_BLOCKED_COPY).toBe(
      "This plant's grow is archived. Restore the grow to log to it.",
    );
    expect(launch.nextStoredActiveGrowId).toBe(STORED);
  });

  it("still withholds a dangling grow id from the header list", () => {
    const options = buildQuickLogV2TargetOptions(
      [{ id: "tent-junk", name: "Junk", grow_id: "missing-grow" }],
      [{ id: "plant-junk", name: "Junk plant", tent_id: "tent-junk", grow_id: "missing-grow" }],
      [ACTIVE],
      [ARCHIVED],
    );
    expect(options).toEqual([]);
  });
});

describe("header Quick Log targets with an archived grow beside a newer active grow", () => {
  it("lists the archived tent and plant next to the active grow", () => {
    const options = buildQuickLogV2TargetOptions(
      [
        { id: "tent-old", name: "Old tent", grow_id: ARCHIVED },
        { id: "tent-new", name: "New tent", grow_id: ACTIVE },
        { id: "tent-retired", name: "Retired tent", grow_id: ARCHIVED, is_archived: true },
      ],
      [
        { id: "plant-old", name: "Old plant", tent_id: "tent-old", grow_id: ARCHIVED },
        { id: "plant-new", name: "New plant", tent_id: "tent-new", grow_id: ACTIVE },
        {
          id: "plant-merged",
          name: "Merged",
          tent_id: "tent-old",
          grow_id: ARCHIVED,
          is_archived: true,
        },
      ],
      [ACTIVE],
      [ARCHIVED],
    );

    expect(options.map((option) => `${option.type}:${option.id}`)).toEqual([
      "tent:tent-old",
      "tent:tent-new",
      "plant:plant-old",
      "plant:plant-new",
    ]);
    expect(options.find((option) => option.id === "plant-old")?.growArchived).toBe(true);
    expect(options.find((option) => option.id === "tent-old")?.growArchived).toBe(true);
    expect(options.find((option) => option.id === "plant-new")?.growArchived).toBeUndefined();
  });

  it("allows a V2 note on the archived grow and blocks water and feed", () => {
    expect(
      quickLogArchivedGrowActionBlock({
        growId: ARCHIVED,
        action: "note",
        archivedGrowIds: [ARCHIVED],
      }),
    ).toBeNull();
    expect(
      quickLogArchivedGrowActionBlock({
        growId: ARCHIVED,
        action: "water",
        archivedGrowIds: [ARCHIVED],
      }),
    ).toBe(ARCHIVED_GROW_QUICK_LOG_BLOCKED_COPY);
    expect(
      quickLogArchivedGrowActionBlock({
        growId: ARCHIVED,
        action: "feed",
        archivedGrowIds: [ARCHIVED],
      }),
    ).toBe(ARCHIVED_GROW_QUICK_LOG_BLOCKED_COPY);
    expect(
      quickLogArchivedGrowActionBlock({
        growId: ACTIVE,
        action: "water",
        archivedGrowIds: [ARCHIVED],
      }),
    ).toBeNull();
  });
});

describe("restore grow", () => {
  it("keeps a missing archive flag on the active roster", () => {
    expect(
      partitionGrowsByArchive([
        { id: "plain", name: "Plain" },
        { id: "open", name: "Open", is_archived: false },
        { id: "closed", name: "Closed", is_archived: true },
      ]).active.map((row) => row.id),
    ).toEqual(["plain", "open"]);
  });

  it("proceeds when the free-tier gate allows another active grow", () => {
    expect(planGrowRestore({ allowed: true, blockedCopy: null })).toEqual({
      proceed: true,
      errorCopy: null,
    });
  });

  it("surfaces the free-tier cap without restoring", () => {
    expect(
      planGrowRestore({
        allowed: false,
        blockedCopy: FREE_GROW_LIMIT_BLOCKED_COPY,
      }),
    ).toEqual({
      proceed: false,
      errorCopy: FREE_GROW_LIMIT_BLOCKED_COPY,
    });
  });

  it("maps the server cap error onto the same gate copy", () => {
    expect(
      growRestoreFailureCopy({
        message: "free_active_grow_limit_reached",
        details: "Free accounts may have one active grow.",
      }),
    ).toBe(FREE_GROW_LIMIT_BLOCKED_COPY);
    expect(growRestoreFailureCopy({ message: "permission denied" })).toBe(
      "Unable to restore this grow. Please try again.",
    );
  });
});
