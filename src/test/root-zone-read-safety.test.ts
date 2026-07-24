import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("root-zone continuity read-path safety", () => {
  it("keeps the AI Doctor root-zone hook bounded, RLS-scoped, and read-only", () => {
    const src = read("src/hooks/useRootZoneObservations.ts");

    expect(src).toContain('.from("grow_events")');
    expect(src).toContain("ROOT_ZONE_GROW_EVENT_SELECT");
    expect(src).toMatch(/\.limit\(/);
    expect(src).toContain('kind: "plant_context"');
    expect(src).toContain('.eq("grow_id", scope.growId)');
    expect(src).toContain('.eq("tent_id", scope.tentId)');
    expect(src).toContain("plant_id.is.null");
    expect(src).toContain("isUuid(scope.plantId)");
    expect(src).not.toMatch(/\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
    expect(src).not.toMatch(/\.rpc\s*\(|functions\.invoke|service_role/i);
    expect(src).not.toMatch(/\.eq\(\s*["']user_id["']/);
    expect(src).not.toMatch(/action_queue|device_control|turn_on|turn_off/i);
  });

  it("uses typed feeding rows first and preserves a bounded legacy fallback", () => {
    const src = read("src/hooks/useRecentFeedingsForDefaults.ts");

    expect(src).toContain('.from("grow_events")');
    expect(src).toContain('.eq("event_type", "feeding")');
    expect(src).toContain("ROOT_ZONE_GROW_EVENT_SELECT");
    expect(src).toContain("mapGrowEventsToRecentRawEntries");
    expect(src).toContain("buildFeedingDefaults");
    expect(src).toContain("if (typedDefaults.defaults) return typedRows");
    expect(src).toContain('.from("diary_entries")');
    expect(src).toContain("RECENT_FEEDINGS_DEFAULTS_LIMIT");
    expect(src).not.toMatch(/\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
  });

  it("keeps the shared root-zone rules pure and excludes raw payload fields", () => {
    const src = read("src/lib/rootZoneObservationRules.ts");

    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase|createClient|\bfetch\s*\(/i);
    expect(src).not.toMatch(/raw_payload|raw_row|device_serial|bridge_token/i);
    expect(src).not.toMatch(/action_queue|device_control|turn_on|turn_off/i);
  });
});
