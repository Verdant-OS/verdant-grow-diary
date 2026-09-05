/**
 * Visit Checkpoint Resurface V0 — pure parse + visibility rules.
 * No I/O, no Action Queue, no schema.
 */
import { describe, it, expect } from "vitest";
import { composeGrowWalkCloseoutNote } from "@/lib/growWalkContracts";
import {
  parseNextCheckpointFromNote,
  selectVisitCheckpointResurface,
  composeThenParseCheckpoint,
  VISIT_CHECKPOINT_NOTE_LABEL,
  VISIT_CHECKPOINT_RESURFACE_MAX_AGE_HOURS,
  VISIT_CHECKPOINT_KNOWN_OPTIONS,
} from "@/lib/visitCheckpointResurfaceRules";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");

describe("parseNextCheckpointFromNote", () => {
  it("returns null for empty / missing notes", () => {
    expect(parseNextCheckpointFromNote(null)).toBeNull();
    expect(parseNextCheckpointFromNote(undefined)).toBeNull();
    expect(parseNextCheckpointFromNote("")).toBeNull();
    expect(parseNextCheckpointFromNote("   ")).toBeNull();
  });

  it("returns null when the Next checkpoint label is absent", () => {
    expect(parseNextCheckpointFromNote("Observation: canopy looks fine")).toBeNull();
    expect(
      parseNextCheckpointFromNote(
        composeGrowWalkCloseoutNote({
          observation: "Leaves droop a bit",
          interpretation: "Likely thirst",
          action: "Watered lightly",
        }),
      ),
    ).toBeNull();
  });

  it("parses the composed Guided Walk closeout line for known options", () => {
    for (const option of VISIT_CHECKPOINT_KNOWN_OPTIONS) {
      const note = composeGrowWalkCloseoutNote({
        observation: "Canopy check",
        interpretation: "Steady",
        action: "No change",
        nextCheckpoint: option,
      });
      expect(note).toContain(`${VISIT_CHECKPOINT_NOTE_LABEL} ${option}`);
      expect(parseNextCheckpointFromNote(note)).toBe(option);
      expect(composeThenParseCheckpoint(option)).toBe(option);
    }
  });

  it("parses a bare Next checkpoint line", () => {
    expect(parseNextCheckpointFromNote("Next checkpoint: 72 hours")).toBe("72 hours");
  });

  it("ignores empty checkpoint values", () => {
    expect(parseNextCheckpointFromNote("Next checkpoint:")).toBeNull();
    expect(parseNextCheckpointFromNote("Next checkpoint:   ")).toBeNull();
  });

  it("is case-insensitive on the label prefix", () => {
    expect(parseNextCheckpointFromNote("next checkpoint: 24 hours")).toBe("24 hours");
  });
});

describe("selectVisitCheckpointResurface", () => {
  it("hides when there are no notes", () => {
    expect(selectVisitCheckpointResurface({ notes: [], now: NOW })).toEqual({
      show: false,
      reason: "no_notes",
    });
    const empty = selectVisitCheckpointResurface({ notes: null, now: NOW });
    expect(empty.show).toBe(false);
    if (empty.show) return;
    expect(empty.reason).toBe("no_notes");
  });

  it("hides when notes lack the checkpoint label", () => {
    const result = selectVisitCheckpointResurface({
      now: NOW,
      notes: [
        {
          id: "e1",
          note: "Observation: just a note",
          occurredAt: "2026-09-05T10:00:00.000Z",
        },
      ],
    });
    expect(result).toEqual({ show: false, reason: "no_checkpoint" });
  });

  it("shows a calm cue for a recent note with Next checkpoint: 72 hours", () => {
    const note = composeGrowWalkCloseoutNote({
      observation: "Canopy look",
      nextCheckpoint: "72 hours",
    });
    const result = selectVisitCheckpointResurface({
      now: NOW,
      notes: [
        {
          id: "walk-1",
          note,
          occurredAt: "2026-09-04T12:00:00.000Z", // 24h ago
        },
      ],
    });
    expect(result.show).toBe(true);
    if (!result.show) return;
    expect(result.checkpointLabel).toBe("72 hours");
    expect(result.headline).toBe("Next checkpoint");
    expect(result.body).toContain("72 hours");
    expect(result.entryId).toBe("walk-1");
  });

  it("prefers the newest checkpoint-bearing note", () => {
    const result = selectVisitCheckpointResurface({
      now: NOW,
      notes: [
        {
          id: "older",
          note: "Next checkpoint: 24 hours",
          occurredAt: "2026-09-03T12:00:00.000Z",
        },
        {
          id: "newer",
          note: "Next checkpoint: Next visit",
          occurredAt: "2026-09-05T06:00:00.000Z",
        },
      ],
    });
    expect(result.show).toBe(true);
    if (!result.show) return;
    expect(result.checkpointLabel).toBe("Next visit");
    expect(result.entryId).toBe("newer");
  });

  it("hides when the newest checkpoint is older than the resurface window", () => {
    const maxAgeHours = VISIT_CHECKPOINT_RESURFACE_MAX_AGE_HOURS;
    const tooOldIso = new Date(NOW - (maxAgeHours + 1) * 60 * 60 * 1000).toISOString();
    const result = selectVisitCheckpointResurface({
      now: NOW,
      notes: [
        {
          id: "stale",
          note: "Next checkpoint: 72 hours",
          occurredAt: tooOldIso,
        },
      ],
    });
    expect(result).toEqual({ show: false, reason: "expired" });
  });

  it("rejects invalid now", () => {
    const result = selectVisitCheckpointResurface({
      notes: [{ note: "Next checkpoint: 24 hours", occurredAt: "2026-09-05T10:00:00.000Z" }],
      now: Number.NaN,
    });
    expect(result.show).toBe(false);
    if (result.show) return;
    expect(result.reason).toBe("invalid_now");
  });
});
