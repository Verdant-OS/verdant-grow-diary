/**
 * Tests for the extracted Quick Log v2 photo diary write helper.
 *
 * Covers:
 *   1. Pure payload builder shape (parity with previous inline insert).
 *   2. Default-note fallback when the grower's note is empty.
 *   3. `createQuickLogPhotoDiaryEntry` calls `diary_entries.insert` once
 *      with the built row and surfaces success/error cleanly.
 *   4. Static safety: `QuickLogV2Sheet.tsx` no longer contains a direct
 *      `supabase.from(` write.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/integrations/supabase/client", () => {
  const insert = vi.fn(async (_row: unknown) => ({ error: null }));
  const from = vi.fn(() => ({ insert }));
  return {
    supabase: { from },
    __mock: { from, insert },
  };
});

import {
  buildQuickLogPhotoDiaryEntryRow,
  createQuickLogPhotoDiaryEntry,
  QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE,
} from "@/lib/quickLogPhotoDiaryEntry";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as supabaseModule from "@/integrations/supabase/client";
const mock = (supabaseModule as unknown as {
  __mock: { from: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };
}).__mock;

const FIXED_NOW = new Date("2026-07-07T12:00:00.000Z");
const now = () => FIXED_NOW;

const baseInput = {
  growId: "grow-1",
  tentId: "tent-1",
  plantId: "plant-1",
  photoPath: "user-1/grow-1/123.jpg",
  noteRaw: "Leaf curl on lower fan",
  action: "water",
  now,
};

describe("buildQuickLogPhotoDiaryEntryRow", () => {
  it("builds the exact row shape previously inlined in the sheet", () => {
    expect(buildQuickLogPhotoDiaryEntryRow(baseInput)).toEqual({
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      note: "Leaf curl on lower fan",
      photo_url: "user-1/grow-1/123.jpg",
      entry_at: FIXED_NOW.toISOString(),
      details: {
        event_type: "quicklog_photo_attachment",
        source: "manual",
        attached_to_action: "water",
      },
    });
  });

  it("falls back to the default note when the note is empty/whitespace", () => {
    for (const noteRaw of ["", "   ", "\n\t"]) {
      const row = buildQuickLogPhotoDiaryEntryRow({ ...baseInput, noteRaw });
      expect(row.note).toBe(QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE);
    }
  });

  it("preserves null tent/plant scoping without inventing values", () => {
    const row = buildQuickLogPhotoDiaryEntryRow({
      ...baseInput,
      tentId: null,
      plantId: null,
    });
    expect(row.tent_id).toBeNull();
    expect(row.plant_id).toBeNull();
  });
});

describe("createQuickLogPhotoDiaryEntry", () => {
  beforeEach(() => {
    mock.from.mockClear();
    mock.insert.mockClear();
    mock.insert.mockImplementation(async () => ({ error: null }));
  });

  it("inserts exactly one diary_entries row with the built payload", async () => {
    const res = await createQuickLogPhotoDiaryEntry(baseInput);
    expect(res).toEqual({ ok: true });
    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(mock.from).toHaveBeenCalledWith("diary_entries");
    expect(mock.insert).toHaveBeenCalledTimes(1);
    expect(mock.insert.mock.calls[0][0]).toEqual(
      buildQuickLogPhotoDiaryEntryRow(baseInput),
    );
  });

  it("returns a failure message on insert error and does not throw", async () => {
    mock.insert.mockImplementationOnce(async () => ({
      error: { message: "rls denied" },
    }));
    const res = await createQuickLogPhotoDiaryEntry(baseInput);
    expect(res.ok).toBe(false);
    expect(res).toEqual({
      ok: false,
      message: "Photo diary entry failed: rls denied",
    });
  });

  it("rapid retap-style parallel invocations only insert one row each (caller-owned guard)", async () => {
    // The sync in-flight guard lives on the caller (component ref). The
    // helper itself is intentionally not stateful; verify that when the
    // caller does invoke it twice serially, each call maps to exactly
    // one insert (no hidden duplication inside the helper).
    await createQuickLogPhotoDiaryEntry(baseInput);
    await createQuickLogPhotoDiaryEntry(baseInput);
    expect(mock.insert).toHaveBeenCalledTimes(2);
  });
});

describe("QuickLogV2Sheet static safety — photo diary extraction", () => {
  it("QuickLogV2Sheet.tsx no longer contains a direct supabase.from(...) write", () => {
    const raw = readFileSync(
      join(process.cwd(), "src", "components", "QuickLogV2Sheet.tsx"),
      "utf8",
    );
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    // storage.from is allowed (photo upload); .from( on its own must be gone.
    expect(stripped).not.toMatch(/[^.]supabase\.from\(/);
  });

  it("sheet imports the extracted helper", () => {
    const src = readFileSync(
      join(process.cwd(), "src", "components", "QuickLogV2Sheet.tsx"),
      "utf8",
    );
    expect(src).toMatch(/createQuickLogPhotoDiaryEntry/);
  });
});
