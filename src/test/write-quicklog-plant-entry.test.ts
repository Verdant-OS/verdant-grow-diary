/**
 * writeQuickLogPlantEntry — behavior + trust-boundary coverage.
 *
 * PlantQuickLog must not write tables directly (enforced by
 * plant-quick-log.test.ts). This lib writer is the sanctioned home for the
 * primary Quick Log diary row, so it carries its own guards:
 *   - delegates row shape to the existing pure buildQuickLogInsertDraft
 *   - validation failures never reach the client
 *   - ownership stays with RLS: the row never carries the owner column
 *   - error contract returns { ok: false, reason, detail } and never throws
 *   - static: a diary_entries insert only; no other tables, RPCs, or clients
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  writeQuickLogPlantEntry,
  type QuickLogPlantEntryClient,
} from "@/lib/writeQuickLogPlantEntry";
import type { BuildQuickLogInsertArgs } from "@/lib/quickLogRules";

const REPO_ROOT = resolve(__dirname, "..", "..");

const EMPTY_SENSORS = { temp: "", humidity: "", ph: "", ec: "" };

function baseInput(overrides: Partial<BuildQuickLogInsertArgs> = {}): BuildQuickLogInsertArgs {
  return {
    plantId: "plant-1",
    plantName: "Sour Diesel #1",
    growId: "grow-1",
    tentId: "tent-1",
    note: "Watered 1 gallon",
    sensors: EMPTY_SENSORS,
    ...overrides,
  };
}

function makeClient(result: { error?: { message?: string } | null } = { error: null }) {
  const insert = vi.fn().mockResolvedValue({ error: result.error ?? null });
  const from = vi.fn().mockReturnValue({ insert });
  const client = { from } as unknown as QuickLogPlantEntryClient;
  return { client, from, insert };
}

describe("writeQuickLogPlantEntry — insert behavior", () => {
  it("inserts the built draft into diary_entries", async () => {
    const { client, from, insert } = makeClient();
    const r = await writeQuickLogPlantEntry(baseInput(), { client });
    expect(r).toEqual({ ok: true });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("diary_entries");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toEqual({
      grow_id: "grow-1",
      plant_id: "plant-1",
      tent_id: "tent-1",
      note: "Watered 1 gallon",
      photo_url: null,
      details: {
        event_type: "quick_log",
        plant_id: "plant-1",
        plant_name: "Sour Diesel #1",
        tent_id: "tent-1",
      },
    });
  });

  it("preserves the photo path and the manual sensor snapshot", async () => {
    const { client, insert } = makeClient();
    await writeQuickLogPlantEntry(
      baseInput({
        photoPath: "user-1/grow-1/1752600000000.jpg",
        sensors: { temp: "78", humidity: "", ph: "6.2", ec: "" },
      }),
      { client },
    );
    const row = insert.mock.calls[0][0];
    expect(row.photo_url).toBe("user-1/grow-1/1752600000000.jpg");
    expect(row.details.manual_sensor_snapshot).toEqual({
      temp_f: 78,
      humidity_percent: null,
      ph: 6.2,
      ec: null,
      source: "manual",
    });
  });

  it("keeps writing the quick_log event type, not the photo-attachment type", async () => {
    // The two Quick Log writers persist different events; a merge would
    // silently retype these rows.
    const { client, insert } = makeClient();
    await writeQuickLogPlantEntry(baseInput({ photoPath: "user-1/grow-1/9.jpg", note: "" }), {
      client,
    });
    expect(insert).not.toHaveBeenCalled();
    const withNote = makeClient();
    await writeQuickLogPlantEntry(baseInput({ photoPath: "user-1/grow-1/9.jpg" }), {
      client: withNote.client,
    });
    expect(withNote.insert.mock.calls[0][0].details.event_type).toBe("quick_log");
    expect(withNote.insert.mock.calls[0][0].details.event_type).not.toBe(
      "quicklog_photo_attachment",
    );
  });

  it("never sets the owner column — RLS derives it from the auth context", async () => {
    const { client, insert } = makeClient();
    await writeQuickLogPlantEntry(baseInput(), { client });
    expect(JSON.stringify(insert.mock.calls[0][0])).not.toContain("user_id");
  });
});

describe("writeQuickLogPlantEntry — validation before I/O", () => {
  it("rejects an invalid draft without touching the client", async () => {
    const cases: Array<[string, Partial<BuildQuickLogInsertArgs>]> = [
      ["missing_note", { note: "   " }],
      ["missing_plant_id", { plantId: "" }],
      ["missing_grow_id", { growId: "" }],
    ];
    for (const [detail, overrides] of cases) {
      const { client, insert } = makeClient();
      const r = await writeQuickLogPlantEntry(baseInput(overrides), { client });
      expect(r).toEqual({ ok: false, reason: "invalid_draft", detail });
      expect(insert).not.toHaveBeenCalled();
    }
  });
});

describe("writeQuickLogPlantEntry — error contract", () => {
  it("surfaces insert errors as insert_error with the detail kept for logging", async () => {
    const { client } = makeClient({
      error: { message: "permission denied for table diary_entries" },
    });
    const r = await writeQuickLogPlantEntry(baseInput(), { client });
    expect(r).toEqual({
      ok: false,
      reason: "insert_error",
      detail: "permission denied for table diary_entries",
    });
  });

  it("returns an error result instead of throwing when the client throws", async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockRejectedValue(new Error("boom")),
      }),
    } as unknown as QuickLogPlantEntryClient;
    const r = await writeQuickLogPlantEntry(baseInput(), { client });
    expect(r).toEqual({ ok: false, reason: "unexpected_error", detail: "boom" });
  });
});

describe("writeQuickLogPlantEntry — static trust-boundary guards", () => {
  const src = readFileSync(resolve(REPO_ROOT, "src/lib/writeQuickLogPlantEntry.ts"), "utf8");

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
    expect(src).not.toMatch(/user_id\s*:/);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(src).not.toMatch(/createClient\s*\(/);
  });
});
