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
  const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  const ownerEq = vi.fn(() => ({ maybeSingle }));
  const idEq = vi.fn(() => ({ eq: ownerEq }));
  const select = vi.fn(() => ({ eq: idEq }));
  const from = vi.fn(() => ({ insert, select }));
  return {
    supabase: { from },
    __mock: { from, insert, select, idEq, ownerEq, maybeSingle },
  };
});

import {
  buildQuickLogPhotoDiaryEntryRow,
  createQuickLogPhotoDiaryEntry,
  QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE,
} from "@/lib/quickLogPhotoDiaryEntry";

import * as supabaseModule from "@/integrations/supabase/client";
const mock = (
  supabaseModule as unknown as {
    __mock: {
      from: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
      select: ReturnType<typeof vi.fn>;
      idEq: ReturnType<typeof vi.fn>;
      ownerEq: ReturnType<typeof vi.fn>;
      maybeSingle: ReturnType<typeof vi.fn>;
    };
  }
).__mock;

const FIXED_NOW = new Date("2026-07-07T12:00:00.000Z");
const now = () => FIXED_NOW;

const baseInput = {
  growId: "grow-1",
  tentId: "tent-1",
  plantId: "plant-1",
  photoPath: "user-1/grow-1/123.jpg",
  noteRaw: "Leaf curl on lower fan",
  action: "water",
  ownerId: "owner-1",
  entryId: "00000000-0000-4000-8000-000000000111",
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
    mock.insert.mockReset();
    mock.select.mockClear();
    mock.idEq.mockClear();
    mock.ownerEq.mockClear();
    mock.maybeSingle.mockReset();
    mock.insert.mockImplementation(async () => ({ error: null }));
    mock.maybeSingle.mockImplementation(async () => ({ data: null, error: null }));
  });

  it("inserts exactly one diary_entries row with the built payload", async () => {
    const res = await createQuickLogPhotoDiaryEntry(baseInput);
    expect(res).toEqual({ ok: true });
    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(mock.from).toHaveBeenCalledWith("diary_entries");
    expect(mock.insert).toHaveBeenCalledTimes(1);
    expect(mock.insert.mock.calls[0][0]).toEqual({
      ...buildQuickLogPhotoDiaryEntryRow(baseInput),
      id: "00000000-0000-4000-8000-000000000111",
    });
  });

  it("returns a failure message on insert error and does not throw", async () => {
    mock.insert.mockImplementationOnce(async () => ({
      error: { message: "rls denied", code: "42501" },
    }));
    const res = await createQuickLogPhotoDiaryEntry(baseInput);
    expect(res.ok).toBe(false);
    expect(res).toEqual({
      ok: false,
      message: "Photo diary entry failed: rls denied",
    });
  });

  it("reconciles a preallocated diary id scoped to its owner after a lost insert response", async () => {
    mock.insert.mockResolvedValueOnce({
      error: { message: "duplicate key after lost response", code: "23505" },
    });
    mock.maybeSingle.mockResolvedValueOnce({
      data: { id: "00000000-0000-4000-8000-000000000111" },
      error: null,
    });

    await expect(createQuickLogPhotoDiaryEntry(baseInput)).resolves.toEqual({ ok: true });

    expect(mock.insert.mock.calls[0][0]).toEqual({
      ...buildQuickLogPhotoDiaryEntryRow(baseInput),
      id: "00000000-0000-4000-8000-000000000111",
    });
    expect(mock.select).toHaveBeenCalledWith("id");
    expect(mock.idEq).toHaveBeenCalledWith("id", "00000000-0000-4000-8000-000000000111");
    expect(mock.ownerEq).toHaveBeenCalledWith("user_id", "owner-1");
  });

  it("marks an error-form transport loss uncertain until the exact owner row can be confirmed", async () => {
    mock.insert.mockResolvedValueOnce({
      error: { message: "TypeError: Failed to fetch", code: "" },
    });
    mock.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(createQuickLogPhotoDiaryEntry(baseInput)).resolves.toEqual({
      ok: false,
      ambiguous: true,
      message: "Could not confirm the photo attachment; it may still appear in history.",
    });
    expect(mock.ownerEq).toHaveBeenCalledWith("user_id", "owner-1");
  });

  it("marks a lost insert response uncertain when the exact owner row cannot be confirmed", async () => {
    mock.insert.mockRejectedValueOnce(new Error("network interrupted"));
    mock.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(createQuickLogPhotoDiaryEntry(baseInput)).resolves.toEqual({
      ok: false,
      ambiguous: true,
      message: "Could not confirm the photo attachment; it may still appear in history.",
    });
    expect(mock.ownerEq).toHaveBeenCalledWith("user_id", "owner-1");
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
  it("merges optional extraDetails while the fixed identity keys always win", () => {
    const row = buildQuickLogPhotoDiaryEntryRow({
      ownerId: "owner-1",
      growId: "g1",
      tentId: null,
      plantId: "p1",
      photoPath: "u1/g1/1.jpg",
      noteRaw: "day 40",
      action: "photo",
      extraDetails: {
        subject: "buds",
        caption: "day 40 flower",
        // Attempted spoofs of the fixed envelope must lose:
        event_type: "fake",
        source: "live",
      },
      now: () => new Date("2026-07-23T00:00:00Z"),
    });
    expect(row.details).toEqual({
      subject: "buds",
      caption: "day 40 flower",
      event_type: "quicklog_photo_attachment",
      source: "manual",
      attached_to_action: "photo",
    });
  });

  it("eventType override gives standalone Photo saves a displayable type (default marker preserved)", () => {
    const base = {
      ownerId: "owner-1",
      growId: "g1",
      tentId: null,
      plantId: "p1",
      photoPath: "u1/g1/1.jpg",
      noteRaw: "",
      action: "photo",
      now: () => new Date("2026-07-23T00:00:00Z"),
    };
    expect(buildQuickLogPhotoDiaryEntryRow(base).details.event_type).toBe(
      "quicklog_photo_attachment",
    );
    expect(
      buildQuickLogPhotoDiaryEntryRow({ ...base, eventType: "photo" }).details.event_type,
    ).toBe("photo");
  });

  it("QuickLogV2Sheet.tsx no longer contains a direct supabase.from(...) write", () => {
    const raw = readFileSync(
      join(process.cwd(), "src", "components", "QuickLogV2Sheet.tsx"),
      "utf8",
    );
    const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
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
