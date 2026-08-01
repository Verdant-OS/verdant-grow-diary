import { describe, expect, it } from "vitest";
import { buildSymptomEvidenceChecklist } from "@/lib/symptomEvidenceChecklistRules";

const symptom = {
  id: "symptom-1",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  entry_at: "2026-08-01T12:00:00.000Z",
  event_type: "observation",
  note: "Yellowing on lower leaves",
  details: { subtype: "issue", observedSign: "discoloration" },
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

  it("returns null for a generic issue or unsupported sign", () => {
    expect(
      buildSymptomEvidenceChecklist({
        symptomEntry: { ...symptom, details: { subtype: "issue", observedSign: "curling" } },
        entries: [],
        historyComplete: true,
      }),
    ).toBeNull();
  });
});
