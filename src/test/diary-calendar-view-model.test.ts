/**
 * diaryCalendarViewModel — pure rule tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDiaryCalendarViewModel,
  summarizeDiaryCalendar,
  DIARY_CALENDAR_EMPTY_TITLE,
  DIARY_CALENDAR_EMPTY_HINT,
} from "@/lib/diaryCalendarViewModel";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("buildDiaryCalendarViewModel", () => {
  it("groups watering, feeding, and diagnosis events by UTC date, newest first", () => {
    const groups = buildDiaryCalendarViewModel([
      { id: "a", entry_at: "2026-06-10T09:00:00Z", event_type: "watering" },
      { id: "b", entry_at: "2026-06-10T18:30:00Z", event_type: "feeding" },
      { id: "c", entry_at: "2026-06-11T08:00:00Z", event_type: "diagnosis" },
      { id: "d", entry_at: "2026-06-11T07:00:00Z", details: { event_type: "ai_doctor_review" } },
    ]);
    expect(groups.map((g) => g.dateKey)).toEqual(["2026-06-11", "2026-06-10"]);
    expect(groups[0].events[0].id).toBe("c");
    expect(groups[0].events[1].kind).toBe("diagnosis");
    expect(groups[0].counts.diagnosis).toBe(2);
    expect(groups[1].counts.watering).toBe(1);
    expect(groups[1].counts.feeding).toBe(1);
  });

  it("ignores unrelated event kinds (photo, observation, environment, unknown)", () => {
    const groups = buildDiaryCalendarViewModel([
      { id: "p", entry_at: "2026-06-12T10:00:00Z", event_type: "photo" },
      { id: "o", entry_at: "2026-06-12T11:00:00Z", event_type: "observation" },
      { id: "e", entry_at: "2026-06-12T12:00:00Z", event_type: "environment" },
      { id: "x", entry_at: "2026-06-12T13:00:00Z", event_type: "mystery" },
      { id: "w", entry_at: "2026-06-12T14:00:00Z", event_type: "watering" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((e) => e.id)).toEqual(["w"]);
  });

  it("returns an empty array for empty/invalid input and degrades for bad dates", () => {
    expect(buildDiaryCalendarViewModel([])).toEqual([]);
    expect(buildDiaryCalendarViewModel(null)).toEqual([]);
    expect(buildDiaryCalendarViewModel(undefined)).toEqual([]);
    const groups = buildDiaryCalendarViewModel([
      { id: "x", entry_at: "not-a-date", event_type: "watering" },
      { id: "", entry_at: "2026-06-12T10:00:00Z", event_type: "watering" },
      { id: "ok", entry_at: "2026-06-12T10:00:00Z", event_type: "watering" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((e) => e.id)).toEqual(["ok"]);
  });

  it("caps notes and exposes only safe plant_name from details", () => {
    const longNote = "x".repeat(500);
    const groups = buildDiaryCalendarViewModel([
      {
        id: "a",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "feeding",
        note: longNote,
        details: { plant_name: "Blueberry #2", raw_payload: { secret: "leak" } },
      },
    ]);
    const ev = groups[0].events[0];
    expect(ev.plantName).toBe("Blueberry #2");
    expect(ev.noteSnippet && ev.noteSnippet.length).toBeLessThanOrEqual(140);
  });

  it("falls back to details.event_type when top-level event_type is missing", () => {
    const groups = buildDiaryCalendarViewModel([
      { id: "a", entry_at: "2026-06-10T09:00:00Z", details: { event_type: "watering" } },
    ]);
    expect(groups[0].events[0].kind).toBe("watering");
  });

  it("is stable: same input → same output", () => {
    const input = [
      { id: "a", entry_at: "2026-06-10T09:00:00Z", event_type: "watering" },
      { id: "b", entry_at: "2026-06-10T09:00:00Z", event_type: "feeding" },
    ];
    expect(buildDiaryCalendarViewModel(input)).toEqual(
      buildDiaryCalendarViewModel(input),
    );
  });
});

describe("summarizeDiaryCalendar", () => {
  it("returns zeroed summary for empty input", () => {
    expect(summarizeDiaryCalendar([])).toEqual({
      totalEvents: 0,
      totalDays: 0,
      counts: { watering: 0, feeding: 0, diagnosis: 0 },
    });
  });

  it("counts events across days", () => {
    const groups = buildDiaryCalendarViewModel([
      { id: "a", entry_at: "2026-06-10T09:00:00Z", event_type: "watering" },
      { id: "b", entry_at: "2026-06-11T09:00:00Z", event_type: "feeding" },
      { id: "c", entry_at: "2026-06-11T10:00:00Z", event_type: "diagnosis" },
    ]);
    const s = summarizeDiaryCalendar(groups);
    expect(s.totalDays).toBe(2);
    expect(s.totalEvents).toBe(3);
    expect(s.counts).toEqual({ watering: 1, feeding: 1, diagnosis: 1 });
  });
});

describe("diary calendar empty-state copy", () => {
  it("matches the contract", () => {
    expect(DIARY_CALENDAR_EMPTY_TITLE).toBe(
      "No watering, feeding, or diagnosis events logged for this period.",
    );
    expect(DIARY_CALENDAR_EMPTY_HINT).toBe("Use Quick Log to add your next plant event.");
  });
});

describe("diary calendar static safety", () => {
  const VM_SRC = readFileSync(
    resolve(__dirname, "../lib/diaryCalendarViewModel.ts"),
    "utf8",
  );
  const UI_SRC = readFileSync(
    resolve(__dirname, "../components/DiaryCalendarSection.tsx"),
    "utf8",
  );

  it("view-model performs no Supabase writes or RPC calls", () => {
    expect(VM_SRC).not.toMatch(/from\(/);
    expect(VM_SRC).not.toMatch(/\.insert\(/);
    expect(VM_SRC).not.toMatch(/\.update\(/);
    expect(VM_SRC).not.toMatch(/\.delete\(/);
    expect(VM_SRC).not.toMatch(/\.rpc\(/);
    expect(VM_SRC).not.toMatch(/supabase/i);
  });

  it("view-model and UI do not reference Action Queue writes, device control, alerts, or AI calls", () => {
    for (const src of [VM_SRC, UI_SRC]) {
      expect(src).not.toMatch(/action_queue/i);
      expect(src).not.toMatch(/device[_-]?control/i);
      expect(src).not.toMatch(/alerts?\.insert/i);
      expect(src).not.toMatch(/\bopenai\b|anthropic|gateway\.ai/i);
    }
  });

  it("view-model and UI do not leak raw_payload, service_role, or token strings", () => {
    for (const src of [VM_SRC, UI_SRC]) {
      expect(src).not.toMatch(/raw_payload\s*[:.]/);
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/\bbearer\b/i);
    }
  });

  it("view-model rejects raw_payload leakage at runtime", () => {
    const groups = buildDiaryCalendarViewModel([
      {
        id: "a",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "feeding",
        details: {
          plant_name: "OK",
          raw_payload: { token: "tok_secret_abc", service_role: "srv_x" },
          internal_user_id: "uid_hidden",
        },
      },
    ]);
    const serialized = JSON.stringify(groups);
    expect(serialized).not.toMatch(/raw_payload/);
    expect(serialized).not.toMatch(/service_role/);
    expect(serialized).not.toMatch(/tok_secret_abc/);
    expect(serialized).not.toMatch(/srv_x/);
    expect(serialized).not.toMatch(/internal_user_id/);
    expect(serialized).not.toMatch(/uid_hidden/);
  });
});
