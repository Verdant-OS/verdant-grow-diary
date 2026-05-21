import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(
  process.cwd(),
  "docs/testing/typed-event-rls-checklist.md",
);

describe("typed-event RLS/RPC manual verification checklist", () => {
  it("doc exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const doc = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

  const required: Array<[string, RegExp]> = [
    ["mentions create_watering_event", /create_watering_event/],
    ["mentions grow_events parent table", /grow_events/],
    ["mentions watering_events subtype table", /watering_events/],
    ["mentions sibling subtype tables", /feeding_events/],
    ["mentions photo_events", /photo_events/],
    ["mentions observation_events", /observation_events/],
    ["mentions training_events", /training_events/],
    ["mentions environment_events", /environment_events/],
    ["rejects unauthenticated calls", /unauthenticated/i],
    ["cross-user grow_id rejection", /User B'?s `?grow_id`?/i],
    ["cross-user tent_id rejection", /User B'?s `?tent_id`?/i],
    ["cross-user plant_id rejection", /User B'?s `?plant_id`?/i],
    ["plant/tent mismatch rejection", /plant is not assigned to the provided tent/],
    ["volume_ml must be > 0", /volume_ml must be > 0/],
    ["ph range validation", /ph out of range/],
    ["ec validation", /ec_ms_cm < 0/],
    ["runoff_ph validation", /runoff_ph out of range/],
    ["runoff_ec validation", /runoff_ec < 0/],
    ["exactly one parent + one child row", /exactly \*\*one\*\* row in `grow_events`/],
    ["parent event_type = watering", /event_type = 'watering'/],
    ["parent source = manual", /source = 'manual'/],
    ["subtype user_id matches auth.uid", /user_id`? equals `?auth\.uid\(\)/],
    ["no orphan grow_events on failure", /no orphan row/i],
    ["forbids client two-step path", /two-step (path|client path)/i],
    ["forbids service_role usage", /service_role/],
    ["no Leads modification", /Leads/],
    ["blocks QuickLog wiring until signed off", /QuickLog wiring .* blocked/i],
    ["RLS sanity for cross-user SELECT", /cannot `SELECT` User B'?s rows/],
    ["sign-off table present", /Sign-off/],
  ];

  for (const [name, re] of required) {
    it(name, () => {
      expect(doc).toMatch(re);
    });
  }
});
