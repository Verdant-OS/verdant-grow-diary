/**
 * Contract for the single active alert status list (#2399 / #2401).
 *
 * Acknowledged rows must dedupe in environment-alert persistence and stay
 * visible on Plant Detail; an open-only list or diverging copies caused real
 * duplicate inserts and unreachable acknowledged UI.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ACTIVE_ALERT_STATUSES } from "@/lib/alertActiveStatusRules";
import { ASSIGNED_TENT_ALERT_STATUSES } from "@/lib/plantAssignedTentAlertRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("ACTIVE_ALERT_STATUSES (resolved contract)", () => {
  it("treats open and acknowledged as still needing the grower's attention", () => {
    expect([...ACTIVE_ALERT_STATUSES].sort()).toEqual(["acknowledged", "open"]);
  });

  it("does not treat terminal statuses as active", () => {
    for (const terminal of ["resolved", "dismissed"] as const) {
      expect(ACTIVE_ALERT_STATUSES).not.toContain(terminal);
    }
  });

  it("ASSIGNED_TENT_ALERT_STATUSES is the same reference so the query and rules layer cannot drift", () => {
    expect(ASSIGNED_TENT_ALERT_STATUSES).toBe(ACTIVE_ALERT_STATUSES);
  });
});

describe("ACTIVE_ALERT_STATUSES wired into persistence", () => {
  it("usePersistEnvironmentAlerts lists active rows via ACTIVE_ALERT_STATUSES, not an open-only inline list", () => {
    const hook = read("src/hooks/usePersistEnvironmentAlerts.ts");
    expect(hook).toMatch(
      /import\s*\{\s*ACTIVE_ALERT_STATUSES\s*\}\s*from\s*"@\/lib\/alertActiveStatusRules"/,
    );
    expect(hook).toMatch(/listAlerts\(\{\s*growId,\s*statuses:\s*ACTIVE_ALERT_STATUSES\s*\}\)/);
    expect(hook).not.toMatch(/statuses:\s*\[\s*["']open["']\s*\]/);
  });
});
