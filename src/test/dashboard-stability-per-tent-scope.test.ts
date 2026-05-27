import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const DASH = readFileSync(resolve(__dirname, "../pages/Dashboard.tsx"), "utf8");
const HOOK = readFileSync(
  resolve(__dirname, "../hooks/use-sensor-readings.ts"),
  "utf8",
);

const FORBIDDEN =
  /saveAlert\(|logAlertEvent\(|action_queue|service_role|insertAlert\(|device\.control|\bsetAutomation\b|\bautomate\(/i;

describe("Dashboard stability uses per-tent sensor windows", () => {
  it("imports the per-tent hook", () => {
    expect(DASH).toMatch(
      /import\s+\{[^}]*useSensorReadingsByTents[^}]*\}\s+from\s+["']@\/hooks\/use-sensor-readings["']/,
    );
  });

  it("calls the per-tent hook with the tent id list", () => {
    expect(DASH).toMatch(/useSensorReadingsByTents\(tentIds\)/);
    expect(DASH).toMatch(/const\s+tentIds\s*=\s*tents\.map\(\(t\)\s*=>\s*t\.id\)/);
  });

  it("computes stability from readingsByTent[t.id], not the shared global window", () => {
    // The latestPerTent map must source rows from readingsByTent, not the
    // shared `readings.filter((r) => r.tentId === t.id)` global cap.
    expect(DASH).toMatch(/readingsByTent\[t\.id\]/);
    expect(DASH).not.toMatch(/readings\.filter\(\(r\)\s*=>\s*r\.tentId\s*===\s*t\.id\)/);
  });

  it("per-tent hook scopes the supabase query to tent_id with its own limit", () => {
    // Confirm the hook actually filters by tent_id and has a per-tent
    // limit param (not a shared global cap).
    expect(HOOK).toContain("useSensorReadingsByTents");
    expect(HOOK).toMatch(/\.eq\(["']tent_id["'],\s*tentId\)/);
    expect(HOOK).toMatch(/perTentLimit/);
  });

  it("introduces no alert/queue/automation/device-control writes", () => {
    expect(HOOK).not.toMatch(FORBIDDEN);
  });
});
