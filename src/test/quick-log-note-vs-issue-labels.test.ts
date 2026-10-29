import { describe, expect, it } from "vitest";
import {
  QUICK_LOG_ACTIVITY_DEFINITIONS,
  QUICK_LOG_ISSUE_TIMELINE_LABEL,
  QUICK_LOG_NOTE_MARKER_KEY,
  QUICK_LOG_NOTE_MARKER_VALUE,
} from "@/constants/quickLogActivityTypes";
import {
  hasQuickLogNoteMarker,
  indexQuickLogMirrorDetailsByGrowEventId,
  resolveQuickLogEventTimelineLabel,
  resolveQuickLogGrowEventLabel,
  withQuickLogNoteMarker,
} from "@/lib/quickLogActivityRules";
import { getEventType } from "@/lib/diary";
import { resolveEffectiveQuickLogCareType } from "@/lib/environmentCheckTimelineViewModel";
import { resolveQuickLogEventIdentity } from "@/lib/quickLogEventIdentityRules";
import { laneForEventType } from "@/lib/quickLogHistoryRules";
import { toTimelineItem } from "@/lib/growDiaryTimelineRules";
import { normalizeDiaryEntry } from "@/lib/diaryEntryRules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { buildLegacyQuickLogUnifiedPayload } from "@/lib/legacyQuickLogUnifiedSave";

// VER-298: a Note and an Issue both persist as an `observation` grow_events
// row. Only the diary mirror's details tell them apart: a new note carries the
// note marker, an issue carries subtype "issue". Old unmarked notes keep
// "Observation" — accepted by the owner.

const MARKER = { [QUICK_LOG_NOTE_MARKER_KEY]: QUICK_LOG_NOTE_MARKER_VALUE };

function diaryEntry(details: Record<string, unknown>) {
  const entry = normalizeDiaryEntry({
    id: "d1",
    entry_at: "2026-10-28T10:00:00.000Z",
    note: "leaf tips ok",
    details,
  });
  if (!entry) throw new Error("expected a normalized diary entry");
  return entry;
}

describe("note marker", () => {
  it("detects the marker case-insensitively and is null-safe", () => {
    expect(hasQuickLogNoteMarker(MARKER)).toBe(true);
    expect(hasQuickLogNoteMarker({ quick_log_activity: " NOTE " })).toBe(true);
    for (const v of [null, undefined, "note", 1, [], {}, { quick_log_activity: "issue" }]) {
      expect(hasQuickLogNoteMarker(v)).toBe(false);
    }
  });

  it("adds the marker without mutating the input", () => {
    const input = Object.freeze({ subtype: "morning" });
    expect(withQuickLogNoteMarker(input)).toEqual({ subtype: "morning", ...MARKER });
    expect(input).toEqual({ subtype: "morning" });
    expect(withQuickLogNoteMarker(null)).toEqual(MARKER);
  });
});

describe("label rule", () => {
  it("heads a marked observation Note, an issue Issue, and any other observation Observation", () => {
    expect(resolveQuickLogEventTimelineLabel({ eventType: "observation", details: MARKER })).toBe(
      "Note",
    );
    expect(
      resolveQuickLogEventTimelineLabel({ eventType: "observation", detailsSubtype: "issue" }),
    ).toBe(QUICK_LOG_ISSUE_TIMELINE_LABEL);
    expect(resolveQuickLogEventTimelineLabel({ eventType: "observation" })).toBe("Observation");
    expect(QUICK_LOG_ACTIVITY_DEFINITIONS.issue_observation.timelineLabel).toBe("Issue");
  });

  it("keeps the other subtype fences unchanged", () => {
    expect(
      resolveQuickLogEventTimelineLabel({ eventType: "training", detailsSubtype: "defoliation" }),
    ).toBe("Defoliation");
    expect(
      resolveQuickLogEventTimelineLabel({ eventType: "training", detailsSubtype: "issue" }),
    ).toBe("Training");
    expect(resolveQuickLogEventTimelineLabel({ eventType: "watering", details: MARKER })).toBe(
      "Watering",
    );
  });

  it("labels Dashboard and grow-detail rows through their linked diary mirror", () => {
    const mirrors = indexQuickLogMirrorDetailsByGrowEventId([
      { details: { linked_grow_event_id: "ge-note", ...MARKER } },
      { details: { grow_event_id: "ge-issue", subtype: "issue", event_type: "observation" } },
      { details: null },
      { details: ["not", "a", "record"] },
    ]);
    expect(
      resolveQuickLogGrowEventLabel({ id: "ge-note", event_type: "observation" }, mirrors),
    ).toBe("Note");
    expect(
      resolveQuickLogGrowEventLabel({ id: "ge-issue", event_type: "observation" }, mirrors),
    ).toBe("Issue");
    // A mirror outside the fetched window, or an old unmarked note, stays honest.
    expect(
      resolveQuickLogGrowEventLabel({ id: "ge-missing", event_type: "observation" }, mirrors),
    ).toBe("Observation");
    expect(resolveQuickLogGrowEventLabel({ id: null, event_type: "feeding" }, mirrors)).toBe(
      "Feeding",
    );
  });
});

describe("Timeline card and history badge kinds", () => {
  it("resolves a marked note to note, whether or not its mirror was stamped", () => {
    expect(
      resolveEffectiveQuickLogCareType({ details: { event_type: "quick_log", ...MARKER } }),
    ).toBe("note");
    expect(
      resolveEffectiveQuickLogCareType({ details: { event_type: "observation", ...MARKER } }),
    ).toBe("note");
    expect(getEventType("note").label).toBe("Note");
  });

  it("resolves an issue to issue and keeps it in the observation history lane", () => {
    expect(
      resolveEffectiveQuickLogCareType({
        details: { event_type: "observation", subtype: "issue" },
      }),
    ).toBe("issue");
    expect(getEventType("issue").label).toBe("Issue");
    expect(laneForEventType("issue")).toBe("observation");
  });

  it("leaves old notes, typed care events and environment checks as they were", () => {
    expect(resolveEffectiveQuickLogCareType({ details: { event_type: "quick_log" } })).toBe(
      "quick_log",
    );
    expect(resolveEffectiveQuickLogCareType({ details: { event_type: "observation" } })).toBe(
      "observation",
    );
    expect(
      resolveEffectiveQuickLogCareType({ entry_type: "watering", details: { ...MARKER } }),
    ).toBe("watering");
    expect(
      resolveEffectiveQuickLogCareType({
        details: { event_type: "observation", environment_check: { temp_c: 24 }, ...MARKER },
      }),
    ).toBe("environment");
    expect(getEventType("observation").label).toBe("Observation");
    expect(getEventType("not-a-type").value).toBe("observation");
  });
});

describe("plant recent activity, Quick Log history and diary timeline titles", () => {
  it("names a marked note Note and an issue Issue", () => {
    const note = diaryEntry({ event_type: "observation", ...MARKER });
    const issue = diaryEntry({ event_type: "observation", subtype: "issue" });
    const plain = diaryEntry({ event_type: "observation" });
    expect(resolveQuickLogEventIdentity(note).displayLabel).toBe("Note");
    expect(resolveQuickLogEventIdentity(issue).displayLabel).toBe("Issue");
    expect(resolveQuickLogEventIdentity(plain).displayLabel).toBe("Observation");
    expect(toTimelineItem(note).title).toBe("Note");
    expect(toTimelineItem(issue).title).toBe("Issue");
    expect(toTimelineItem(plain).title).toBe("Observation");
  });
});

describe("note payloads carry the marker; other actions do not", () => {
  const target = {
    ok: true as const,
    targetType: "plant" as const,
    targetId: "p1",
    tentId: "t1",
    plantId: "p1",
  };
  const v2 = (over: Record<string, unknown>) =>
    buildQuickLogV2SavePayload({
      resolved: target,
      action: "note",
      volumeMl: "",
      note: "check-in",
      temperatureC: "",
      humidityPct: "",
      vpdKpa: "",
      idempotencyKey: "quicklog-v2-test-key-0001",
      ...over,
    } as Parameters<typeof buildQuickLogV2SavePayload>[0]);

  it("marks a Quick Log V2 note but not a watering or an environment-check envelope", () => {
    const note = v2({});
    const water = v2({ action: "water", volumeMl: "500" });
    const env = v2({ details: { environment_check: { temp_c: 24 } } });
    if (!note.ok || !water.ok || !env.ok) throw new Error("expected ok payloads");
    expect(note.payload.p_details).toEqual(MARKER);
    expect(water.payload.p_details ?? {}).not.toHaveProperty(QUICK_LOG_NOTE_MARKER_KEY);
    expect(env.payload.p_details).not.toHaveProperty(QUICK_LOG_NOTE_MARKER_KEY);
    expect(note.payload).not.toHaveProperty("user_id");
  });

  it("marks a legacy note save but not a legacy observation", () => {
    const base = {
      idempotencyKey: "quicklog-v2-test-key-legacy",
      noteWithHardware: "Leaves curling slightly",
      plantId: "11111111-1111-1111-1111-111111111111",
      plantTentId: "22222222-2222-2222-2222-222222222222",
      details: { ph: "", ec: "", runoff: "", nutrients: "", training: "", watering: "" },
    };
    const note = buildLegacyQuickLogUnifiedPayload({ ...base, eventType: "note" });
    const observation = buildLegacyQuickLogUnifiedPayload({ ...base, eventType: "observation" });
    if (!note.ok || !observation.ok) throw new Error("expected ok payloads");
    expect(note.payload.p_details).toEqual(MARKER);
    expect(observation.payload.p_details ?? {}).not.toHaveProperty(QUICK_LOG_NOTE_MARKER_KEY);
  });
});
