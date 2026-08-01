import { describe, expect, it } from "vitest";
import {
  buildSymptomEvidenceChecklist,
  buildSymptomEvidenceTimelineRows,
} from "@/lib/symptomEvidenceChecklistRules";

const symptom = {
  id: "symptom-1",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  entry_at: "2026-08-01T12:00:00.000Z",
  event_type: "observation",
  note: "Yellowing on lower leaves",
  details: {
    subtype: "issue",
    observedSign: "discoloration",
    observationLocation: "lower_leaves",
    observation_stage: "flower",
  },
};

function category(view: NonNullable<ReturnType<typeof buildSymptomEvidenceChecklist>>, id: string) {
  return view.categories.find((entry) => entry.id === id)!;
}

describe("symptom evidence checklist", () => {
  it("uses an exact inclusive 14-day window and excludes future evidence", () => {
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: symptom,
      historyComplete: true,
      entries: [
        {
          id: "boundary",
          grow_id: "grow-1",
          plant_id: "plant-1",
          occurred_at: "2026-07-18T12:00:00.000Z",
          event_type: "watering",
        },
        {
          id: "older",
          grow_id: "grow-1",
          plant_id: "plant-1",
          occurred_at: "2026-07-18T11:59:59.999Z",
          event_type: "watering",
        },
        {
          id: "future",
          grow_id: "grow-1",
          plant_id: "plant-1",
          occurred_at: "2026-08-01T12:00:00.001Z",
          event_type: "watering",
        },
      ],
    })!;
    expect(category(view, "watering").items.map((item) => item.id)).toEqual(["boundary"]);
  });

  it("enforces grow, plant, and tent scoping without inference", () => {
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: symptom,
      historyComplete: true,
      entries: [
        {
          id: "other-grow",
          grow_id: "grow-2",
          plant_id: "plant-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "feeding",
        },
        {
          id: "other-plant",
          grow_id: "grow-1",
          plant_id: "plant-2",
          tent_id: "tent-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "feeding",
        },
        {
          id: "same-plant",
          grow_id: "grow-1",
          plant_id: "plant-1",
          tent_id: "tent-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "feeding",
        },
        {
          id: "other-tent",
          grow_id: "grow-1",
          plant_id: "plant-2",
          tent_id: "tent-2",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "environment",
        },
        {
          id: "same-plant-other-tent-environment",
          grow_id: "grow-1",
          plant_id: "plant-1",
          tent_id: "tent-2",
          occurred_at: "2026-07-31T13:00:00Z",
          event_type: "environment",
        },
        {
          id: "same-plant-other-tent-lighting",
          grow_id: "grow-1",
          plant_id: "plant-1",
          tent_id: "tent-2",
          occurred_at: "2026-07-31T13:00:00Z",
          event_type: "observation",
          details: { checkType: "light" },
        },
        {
          id: "same-tent",
          grow_id: "grow-1",
          tent_id: "tent-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "environment",
        },
      ],
    })!;
    expect(category(view, "feeding").items.map((item) => item.id)).toEqual(["same-plant"]);
    expect(category(view, "environment").items.map((item) => item.id)).toEqual(["same-tent"]);
    expect(category(view, "lighting").items).toEqual([]);
  });

  it("returns four ordered categories, newest first, capped to three with a stable tie break", () => {
    const entries = ["d", "b", "a", "c"].map((id, index) => ({
      id,
      grow_id: "grow-1",
      plant_id: "plant-1",
      occurred_at: index === 0 ? "2026-07-31T13:00:00Z" : "2026-07-31T12:00:00Z",
      event_type: "watering",
    }));
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: symptom,
      entries,
      historyComplete: true,
    })!;
    expect(view.categories.map((entry) => entry.title)).toEqual([
      "Environment Check",
      "Watering",
      "Feeding",
      "Lighting",
    ]);
    expect(category(view, "watering").totalMatches).toBe(4);
    expect(category(view, "watering").items.map((item) => item.id)).toEqual(["d", "a", "b"]);
  });

  it("uses the shared explicit-light classifier and ignores generic uses of light", () => {
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: symptom,
      historyComplete: true,
      entries: [
        {
          id: "generic",
          grow_id: "grow-1",
          tent_id: "tent-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "observation",
          note: "Light watering",
        },
        {
          id: "explicit",
          grow_id: "grow-1",
          tent_id: "tent-1",
          occurred_at: "2026-07-31T13:00:00Z",
          event_type: "observation",
          details: { checkType: "light" },
        },
      ],
    })!;
    expect(category(view, "lighting").items.map((item) => item.id)).toEqual(["explicit"]);
  });

  it("does not count a symptom diary companion's grow-event parent as prior evidence", () => {
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: {
        ...symptom,
        id: "symptom-diary-row",
        details: {
          ...symptom.details,
          linked_grow_event_id: "symptom-grow-event",
        },
      },
      historyComplete: true,
      entries: [
        {
          id: "symptom-grow-event",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          occurred_at: "2026-08-01T12:00:00Z",
          event_type: "observation",
          note: "Raised the grow light; upper leaves look pale.",
        },
      ],
    })!;

    expect(category(view, "lighting").items).toEqual([]);
    expect(category(view, "lighting").status).toBe("missing");
  });

  it("never turns partial history or missing scope into a confirmed absence", () => {
    const partial = buildSymptomEvidenceChecklist({
      symptomEntry: symptom,
      entries: [],
      historyComplete: false,
    })!;
    expect(partial.categories.every((entry) => entry.status === "limited")).toBe(true);
    const noPlant = buildSymptomEvidenceChecklist({
      symptomEntry: { ...symptom, plant_id: null },
      entries: [],
      historyComplete: true,
    })!;
    expect(category(noPlant, "watering").status).toBe("limited");
    expect(category(noPlant, "feeding").status).toBe("limited");
  });

  it("keeps provenance honest and exposes only allow-listed friendly details", () => {
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: symptom,
      historyComplete: true,
      entries: [
        {
          id: "env",
          grow_id: "grow-1",
          tent_id: "tent-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "environment",
          source: "mqtt",
          details: {
            temp_c: 25,
            humidity_pct: 62,
            bridge_token: "vbt_secret",
            raw_payload: "secret",
          },
        },
      ],
    })!;
    const item = category(view, "environment").items[0];
    expect(item.sourceLabel).toBe("Unverified source");
    expect(item.detailLines).toEqual(["Temperature: 25 °C", "Humidity: 62 % RH"]);
    expect(JSON.stringify(item)).not.toMatch(/vbt_secret|raw_payload|bridge_token/);
  });

  it("keeps blank numeric evidence absent instead of coercing it to zero", () => {
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: symptom,
      historyComplete: true,
      entries: [
        {
          id: "blank-numeric-evidence",
          grow_id: "grow-1",
          tent_id: "tent-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "environment",
          details: {
            temp_c: "",
            humidity_pct: "   ",
            environment_check: { vpd_kpa: "\t" },
          },
        },
      ],
    })!;

    expect(category(view, "environment").items[0].detailLines).toEqual([]);
  });

  it("normalizes control characters without exposing hidden payload text", () => {
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: symptom,
      historyComplete: true,
      entries: [
        {
          id: "control-characters",
          grow_id: "grow-1",
          plant_id: "plant-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "watering",
          note: "Watered\u0000then\u001fchecked runoff",
        },
      ],
    })!;

    expect(category(view, "watering").items[0].summary).toBe("Watered then checked runoff");
  });

  it("does not invent manual provenance from a source-less environment event", () => {
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: symptom,
      historyComplete: true,
      entries: [
        {
          id: "source-less",
          grow_id: "grow-1",
          tent_id: "tent-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "environment",
        },
        {
          id: "structured-manual-check",
          grow_id: "grow-1",
          tent_id: "tent-1",
          occurred_at: "2026-07-31T13:00:00Z",
          event_type: "environment",
          details: { environment_check: { temp_c: 25 } },
        },
      ],
    })!;

    expect(category(view, "environment").items.map((item) => [item.id, item.sourceLabel])).toEqual([
      ["structured-manual-check", "Manual observation"],
      ["source-less", "Unverified source"],
    ]);
  });

  it("does not trust a diary details.source claim as live provenance", () => {
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: symptom,
      historyComplete: true,
      entries: [
        {
          id: "untrusted-diary-light",
          grow_id: "grow-1",
          tent_id: "tent-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "observation",
          note: "Grow light schedule changed to 12/12.",
          details: { source: "live" },
        },
      ],
    })!;

    expect(category(view, "lighting").items[0].sourceLabel).toBe("Unverified source");
  });

  it("preserves canonical companion evidence while keeping grow-event provenance authoritative", () => {
    const parentId = "environment-grow-event";
    const rows = buildSymptomEvidenceTimelineRows({
      growId: "grow-1",
      recentLaneEntries: [
        {
          id: parentId,
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          entry_at: "2026-07-31T12:00:00Z",
          entry_type: "environment_check",
          note: "Checked canopy environment and fixture height.",
          details: { event_type: "environment_check", source: "manual" },
        },
      ],
      diaryEntries: [
        {
          id: "environment-diary-companion",
          tent_id: "tent-1",
          plant_id: "plant-1",
          entry_at: "2026-07-31T12:00:00Z",
          note: "Checked canopy environment and fixture height.",
          details: {
            event_type: "environment_check",
            linked_grow_event_id: parentId,
            source: "live",
            checkType: "light",
            environment_check: { temp_c: 25, humidity_pct: 62 },
          },
        },
      ],
      growEvents: [
        {
          id: parentId,
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "environment_check",
          source: "manual",
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("manual");
    expect(rows[0].details).toMatchObject({
      checkType: "light",
      environment_check: { temp_c: 25, humidity_pct: 62 },
    });

    const view = buildSymptomEvidenceChecklist({
      symptomEntry: symptom,
      historyComplete: true,
      entries: rows,
    })!;
    expect(category(view, "environment").items[0]).toMatchObject({
      id: parentId,
      sourceLabel: "Manual observation",
      detailLines: ["Temperature: 25 °C", "Humidity: 62 % RH"],
    });
    expect(category(view, "lighting").items.map((item) => item.id)).toEqual([parentId]);
  });

  it("returns symptom identity, location, time, hub path, and category-specific verification prompts", () => {
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: symptom,
      entries: [],
      historyComplete: true,
    })!;

    expect(view.title).toBe(
      "Yellowing / discoloration: verify the record before changing anything",
    );
    expect(view.observationStageLabel).toBe("Flower");
    expect(view.observationLocationLabel).toBe("Lower leaves");
    expect(view.observedAt).toBe("2026-08-01T12:00:00.000Z");
    expect(view.hubPath).toBe("/guides/cannabis-leaf-symptoms");
    expect(view.categories.map((entry) => entry.verifyNext)).toEqual([
      expect.stringMatching(/environment check/i),
      expect.stringMatching(/watering/i),
      expect.stringMatching(/feeding/i),
      expect.stringMatching(/light/i),
    ]);
  });

  it("returns null for a generic issue or unsupported sign", () => {
    expect(
      buildSymptomEvidenceChecklist({
        symptomEntry: { ...symptom, details: { subtype: "issue", observedSign: "curling" } },
        entries: [],
        historyComplete: true,
      }),
    ).toBeNull();
  });

  it("fails closed when the symptom observation has no valid timestamp", () => {
    expect(
      buildSymptomEvidenceChecklist({
        symptomEntry: { ...symptom, entry_at: "not-a-date" },
        entries: [],
        historyComplete: true,
      }),
    ).toBeNull();
  });
});
