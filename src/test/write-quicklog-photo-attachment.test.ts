/**
 * writeQuickLogPhotoAttachment — behavior + trust-boundary coverage.
 *
 * The Quick Log v2 sheet must not write tables directly (enforced by
 * quick-log-v2-refresh-*-static-safety). This lib writer is the sanctioned
 * home for the companion photo diary entry, so it carries its own guards:
 *   - exact row shape (note fallback, entry_at stamp, details.event_type)
 *   - ownership stays with RLS: the writer never sets the owner column
 *   - error contract returns { ok: false, message } and never throws
 *   - static: a diary_entries insert only; no other tables, RPCs, or clients
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  writeQuickLogPhotoAttachment,
  buildQuickLogPhotoAttachmentRow,
  QUICK_LOG_PHOTO_ATTACHMENT_EVENT_TYPE,
  QUICK_LOG_PHOTO_ATTACHMENT_NOTE_FALLBACK,
  type PhotoAttachmentDiaryClient,
  type QuickLogPhotoAttachmentInput,
} from "@/lib/writeQuickLogPhotoAttachment";

const REPO_ROOT = resolve(__dirname, "..", "..");

function baseInput(
  overrides: Partial<QuickLogPhotoAttachmentInput> = {},
): QuickLogPhotoAttachmentInput {
  return {
    growId: "grow-1",
    tentId: "tent-1",
    plantId: "plant-1",
    photoPath: "user-1/grow-1/1752600000000.jpg",
    note: "Canopy check",
    attachedToAction: "note",
    ...overrides,
  };
}

function makeClient(result: { error?: { message?: string } | null } = { error: null }) {
  const insert = vi.fn().mockResolvedValue({ error: result.error ?? null });
  const from = vi.fn().mockReturnValue({ insert });
  const client = { from } as unknown as PhotoAttachmentDiaryClient;
  return { client, from, insert };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("buildQuickLogPhotoAttachmentRow", () => {
  it("builds the exact companion diary row shape", () => {
    const r = buildQuickLogPhotoAttachmentRow(baseInput(), "2026-07-16T12:00:00.000Z");
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.row).toEqual({
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      note: "Canopy check",
      photo_url: "user-1/grow-1/1752600000000.jpg",
      entry_at: "2026-07-16T12:00:00.000Z",
      details: {
        event_type: "quicklog_photo_attachment",
        source: "manual",
        attached_to_action: "note",
      },
    });
  });

  it("falls back to the standard note copy when the note is blank", () => {
    for (const blank of ["", "   ", null, undefined]) {
      const r = buildQuickLogPhotoAttachmentRow(
        baseInput({ note: blank }),
        "2026-07-16T12:00:00.000Z",
      );
      expect(r.ok && r.row.note).toBe(QUICK_LOG_PHOTO_ATTACHMENT_NOTE_FALLBACK);
    }
  });

  it("trims a typed note instead of replacing it", () => {
    const r = buildQuickLogPhotoAttachmentRow(
      baseInput({ note: "  looking healthy  " }),
      "2026-07-16T12:00:00.000Z",
    );
    expect(r.ok && r.row.note).toBe("looking healthy");
  });

  it("passes tent/plant context through as explicit nulls", () => {
    const r = buildQuickLogPhotoAttachmentRow(
      baseInput({ tentId: null, plantId: undefined }),
      "2026-07-16T12:00:00.000Z",
    );
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.row.tent_id).toBeNull();
    expect(r.row.plant_id).toBeNull();
  });

  it("carries the attached action verbatim in details", () => {
    const r = buildQuickLogPhotoAttachmentRow(
      baseInput({ attachedToAction: "water" }),
      "2026-07-16T12:00:00.000Z",
    );
    expect(r.ok && r.row.details).toEqual({
      event_type: QUICK_LOG_PHOTO_ATTACHMENT_EVENT_TYPE,
      source: "manual",
      attached_to_action: "water",
    });
  });
});

describe("writeQuickLogPhotoAttachment — validation before I/O", () => {
  it("rejects a missing grow id without touching the client", async () => {
    const { client, insert } = makeClient();
    for (const bad of ["", "   "]) {
      const r = await writeQuickLogPhotoAttachment(baseInput({ growId: bad }), { client });
      expect(r).toEqual({
        ok: false,
        message: "Photo diary entry failed: missing grow context.",
      });
    }
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a missing photo path without touching the client", async () => {
    const { client, insert } = makeClient();
    const r = await writeQuickLogPhotoAttachment(baseInput({ photoPath: "  " }), { client });
    expect(r).toEqual({
      ok: false,
      message: "Photo diary entry failed: missing photo path.",
    });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("writeQuickLogPhotoAttachment — insert behavior", () => {
  it("inserts into diary_entries with a write-time entry_at stamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T12:34:56.000Z"));
    const { client, from, insert } = makeClient();
    const r = await writeQuickLogPhotoAttachment(baseInput(), { client });
    expect(r).toEqual({ ok: true });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("diary_entries");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toEqual({
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      note: "Canopy check",
      photo_url: "user-1/grow-1/1752600000000.jpg",
      entry_at: "2026-07-16T12:34:56.000Z",
      details: {
        event_type: "quicklog_photo_attachment",
        source: "manual",
        attached_to_action: "note",
      },
    });
  });

  it("never sets the owner column — RLS derives it from the auth context", async () => {
    const { client, insert } = makeClient();
    await writeQuickLogPhotoAttachment(baseInput(), { client });
    expect("user_id" in insert.mock.calls[0][0]).toBe(false);
  });

  it("surfaces insert errors via the non-blocking message contract", async () => {
    const { client } = makeClient({
      error: { message: "permission denied for table diary_entries" },
    });
    const r = await writeQuickLogPhotoAttachment(baseInput(), { client });
    expect(r).toEqual({
      ok: false,
      message: "Photo diary entry failed: permission denied for table diary_entries",
    });
  });

  it("returns an error result instead of throwing when the client throws", async () => {
    const insert = vi.fn().mockRejectedValue(new Error("boom"));
    const client = {
      from: vi.fn().mockReturnValue({ insert }),
    } as unknown as PhotoAttachmentDiaryClient;
    const r = await writeQuickLogPhotoAttachment(baseInput(), { client });
    expect(r).toEqual({
      ok: false,
      message: "Photo diary entry failed: unexpected error.",
    });
  });
});

describe("writeQuickLogPhotoAttachment — static trust-boundary guards", () => {
  const src = readFileSync(resolve(REPO_ROOT, "src/lib/writeQuickLogPhotoAttachment.ts"), "utf8");

  it("every table access targets diary_entries only", () => {
    const fromTargets = src.match(/\bfrom\s*\(\s*["'][^"']+["']\s*\)/g) ?? [];
    expect(fromTargets.length).toBeGreaterThan(0);
    for (const t of fromTargets) {
      expect(t).toMatch(/["']diary_entries["']/);
    }
  });

  it("insert-only: no updates/deletes/upserts, RPCs, or edge functions", () => {
    expect(src).not.toMatch(/\.\s*update\s*\(/);
    expect(src).not.toMatch(/\.\s*delete\s*\(/);
    expect(src).not.toMatch(/\.\s*upsert\s*\(/);
    expect(src).not.toMatch(/\.\s*rpc\s*\(/);
    expect(src).not.toMatch(/functions\s*\.\s*invoke/);
  });

  it("never touches alerts/action_queue/ai_doctor_sessions", () => {
    expect(src).not.toMatch(/['"]alerts['"]/);
    expect(src).not.toMatch(/['"]action_queue['"]/);
    expect(src).not.toMatch(/['"]ai_doctor_sessions['"]/);
  });

  it("never sets the owner column or builds its own client", () => {
    expect(src).not.toMatch(/user_id/);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(src).not.toMatch(/createClient\s*\(/);
  });
});
