import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(process.cwd(), "docs/typed-event-launch-gate.md");

describe("typed event launch gate doc", () => {
  it("doc exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const doc = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

  const required: Array<[string, RegExp]> = [
    [
      "references the RLS checklist",
      /docs\/testing\/typed-event-rls-checklist\.md/,
    ],
    ["requires live authenticated-user verification", /live authenticated-user verification/i],
    ["unauthenticated RPC rejection verified", /unauthenticated RPC rejection/i],
    ["owner can create for own grow", /owning user can create a watering event/i],
    ["cross-user grow_id rejection", /Cross-user `?grow_id`? rejection/i],
    ["cross-user tent_id rejection", /Cross-user `?tent_id`? rejection/i],
    ["cross-user plant_id rejection", /Cross-user `?plant_id`? rejection/i],
    ["plant/tent mismatch rejection", /Plant\/tent mismatch rejection/i],
    ["invalid watering values rejected", /Invalid watering values are rejected/i],
    ["volume_ml <= 0 rejected", /volume_ml <= 0/],
    ["ph 0-14 enforced", /ph.*\[0, 14\]/i],
    ["ec_ms_cm negative rejected", /ec_ms_cm.*negative/i],
    ["runoff_ph 0-14 enforced", /runoff_ph.*\[0, 14\]/i],
    ["runoff_ec negative rejected", /runoff_ec.*negative/i],
    [
      "exactly one parent + one child",
      /\*\*exactly one\*\* row in `grow_events`[\s\S]*\*\*exactly one\*\* row in `watering_events`/,
    ],
    ["no orphan parent on failure", /no orphan parent/i],
    ["no client two-step insert path", /no client two-step insert path/i],
    [
      "typedWateringWriteEnabled defaults to false",
      /`typedWateringWriteEnabled` defaults to `false`/,
    ],
    ["QuickLog diary_entries compatibility preserved", /QuickLog `?diary_entries`? compatibility is preserved/i],
    ["rollback plan documented", /## Rollback plan/],
    [
      "forbids non-watering typed writes until RPCs exist",
      /Enabling non-watering typed writes[\s\S]*until a[\s\S]*atomic `create_\*_event` RPC exists/i,
    ],
    [
      "forbids direct client inserts into grow_events/subtype tables",
      /Direct client inserts[\s\S]*forbidden/i,
    ],
    [
      "forbids service_role usage in client/runtime",
      /`service_role` usage in client or runtime code\*\* is forbidden/,
    ],
    [
      "forbids dual-writing without atomic rollback",
      /Dual-writing without an atomic rollback strategy\*\* is forbidden/,
    ],
    ["sign-off table present", /## Sign-off/],
    [
      "flag stays false until sign-off",
      /`typedWateringWriteEnabled` MUST remain `false`/,
    ],
    ["no Leads modification mentioned in scope", /Leads/],
  ];

  for (const [name, re] of required) {
    it(name, () => {
      expect(doc).toMatch(re);
    });
  }
});
