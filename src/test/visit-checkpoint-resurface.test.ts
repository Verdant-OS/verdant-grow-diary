/**
 * VISIT_CHECKPOINT_RESURFACE_V0 — pure parse/derive coverage.
 * No schema. Checkpoint comes from diary note text only.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  appendCheckpointClearMarker,
  buildCheckpointFollowUpNotePrefill,
  CHECKPOINT_STATUS_DISMISSED,
  CHECKPOINT_STATUS_DONE,
  derivePendingCheckpoint,
  isCheckpointClearedInNote,
  parseNextCheckpointFromNote,
} from "@/lib/visitCheckpointRules";
import { composeGrowWalkCloseoutNote } from "@/lib/growWalkContracts";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const RULES = stripSourceComments(
  readFileSync(resolve(ROOT, "src/lib/visitCheckpointRules.ts"), "utf8"),
);
const BANNER = stripSourceComments(
  readFileSync(resolve(ROOT, "src/components/PendingCheckpointBanner.tsx"), "utf8"),
);
const PAGE = stripSourceComments(readFileSync(resolve(ROOT, "src/pages/PlantDetail.tsx"), "utf8"));

describe("parseNextCheckpointFromNote", () => {
  it("parses a Next checkpoint line and trims", () => {
    expect(parseNextCheckpointFromNote("Next checkpoint:  24 hours  ")).toBe("24 hours");
  });

  it("returns null for empty checkpoint text", () => {
    expect(parseNextCheckpointFromNote("Next checkpoint:   ")).toBeNull();
    expect(parseNextCheckpointFromNote("Next checkpoint:")).toBeNull();
  });

  it("returns null when the line is missing", () => {
    expect(parseNextCheckpointFromNote("Observation: leaf curl\nAction: lower RH")).toBeNull();
    expect(parseNextCheckpointFromNote("")).toBeNull();
  });

  it("matches composeGrowWalkCloseoutNote format", () => {
    const note = composeGrowWalkCloseoutNote({
      observation: "Edges crispy",
      interpretation: "Light stress",
      action: "Dim 10%",
      nextCheckpoint: "Recheck in 24h",
    });
    expect(parseNextCheckpointFromNote(note)).toBe("Recheck in 24h");
  });
});

describe("derivePendingCheckpoint", () => {
  it("returns null when entries are missing or empty", () => {
    expect(derivePendingCheckpoint({ entries: null })).toBeNull();
    expect(derivePendingCheckpoint({ entries: [] })).toBeNull();
    expect(derivePendingCheckpoint({ entries: undefined })).toBeNull();
  });

  it("picks the latest entry with a non-empty checkpoint", () => {
    const pending = derivePendingCheckpoint({
      entries: [
        {
          id: "older",
          note: "Next checkpoint: water tomorrow",
          entry_at: "2026-09-01T10:00:00Z",
        },
        {
          id: "newer",
          note: composeGrowWalkCloseoutNote({
            observation: "ok",
            nextCheckpoint: "Same angle photo",
          }),
          entry_at: "2026-09-04T12:00:00Z",
        },
        {
          id: "no-cp",
          note: "Observation: plain note",
          entry_at: "2026-09-05T08:00:00Z",
        },
      ],
    });
    expect(pending).toEqual({
      text: "Same angle photo",
      setAt: "2026-09-04T12:00:00Z",
      diaryEntryId: "newer",
    });
  });

  it("returns null when the latest checkpoint entry is cleared", () => {
    const note =
      composeGrowWalkCloseoutNote({
        observation: "check",
        nextCheckpoint: "24h recheck",
      }) + `\n${CHECKPOINT_STATUS_DONE}`;
    expect(
      derivePendingCheckpoint({
        entries: [
          {
            id: "cleared",
            note,
            entry_at: "2026-09-04T12:00:00Z",
          },
        ],
      }),
    ).toBeNull();
  });

  it("skips cleared entries and surfaces an older uncleared checkpoint", () => {
    const cleared = "Next checkpoint: newest\n" + CHECKPOINT_STATUS_DISMISSED;
    const pending = derivePendingCheckpoint({
      entries: [
        {
          id: "cleared-new",
          note: cleared,
          occurred_at: "2026-09-05T09:00:00Z",
        },
        {
          id: "open-old",
          note: "Next checkpoint: keep watching tips",
          created_at: "2026-09-03T09:00:00Z",
        },
      ],
    });
    expect(pending).toEqual({
      text: "keep watching tips",
      setAt: "2026-09-03T09:00:00Z",
      diaryEntryId: "open-old",
    });
  });
});

describe("clear marker helpers", () => {
  it("detects done/dismissed markers", () => {
    expect(isCheckpointClearedInNote(`x\n${CHECKPOINT_STATUS_DONE}`)).toBe(true);
    expect(isCheckpointClearedInNote(`x\n${CHECKPOINT_STATUS_DISMISSED}`)).toBe(true);
    expect(isCheckpointClearedInNote("Next checkpoint: still open")).toBe(false);
  });

  it("appends a durable clear marker without inventing other content", () => {
    const base = "Next checkpoint: 24h";
    expect(appendCheckpointClearMarker(base, "done")).toBe(`${base}\n${CHECKPOINT_STATUS_DONE}`);
    expect(appendCheckpointClearMarker(base, "dismissed")).toBe(
      `${base}\n${CHECKPOINT_STATUS_DISMISSED}`,
    );
    expect(appendCheckpointClearMarker(`${base}\n${CHECKPOINT_STATUS_DONE}`, "dismissed")).toBe(
      `${base}\n${CHECKPOINT_STATUS_DONE}`,
    );
  });

  it("builds a follow-up note prefill hint only", () => {
    expect(buildCheckpointFollowUpNotePrefill("Same angle")).toBe("Follow-up: Same angle");
    expect(buildCheckpointFollowUpNotePrefill("  ")).toBe("");
  });
});

describe("wiring + GDP gate (static)", () => {
  it("mounts PendingCheckpointBanner on PlantDetail", () => {
    expect(PAGE).toMatch(/PendingCheckpointBanner/);
    expect(PAGE).toMatch(/plantId=\{plant\.id\}/);
  });

  it("banner clears via diary_entries note update and opens Quick Log prefill", () => {
    expect(BANNER).toMatch(/diary_entries/);
    expect(BANNER).toMatch(/\.update\(\{\s*note:/);
    expect(BANNER).toMatch(/PLANT_QUICKLOG_PREFILL_EVENT|verdant:open-quicklog/);
    expect(BANNER).not.toMatch(/action_queue/);
  });

  it("rules module has no schema/RPC/network", () => {
    expect(RULES).not.toMatch(/supabase|fetch\(|localStorage|action_queue|migration/i);
  });
});
