/**
 * Contract: one canonical list of alert statuses that still need attention.
 * Environment persistence and the assigned-tent panel must not drift apart again.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIVE_ALERT_STATUSES } from "@/lib/alertActiveStatusRules";
import { ASSIGNED_TENT_ALERT_STATUSES } from "@/lib/plantAssignedTentAlertRules";

describe("alertActiveStatusRules — shared active status contract", () => {
  it("names open and acknowledged as the only active statuses", () => {
    expect([...ACTIVE_ALERT_STATUSES].sort()).toEqual(["acknowledged", "open"]);
  });

  it("re-exports the same list for the assigned-tent panel query", () => {
    expect(ASSIGNED_TENT_ALERT_STATUSES).toBe(ACTIVE_ALERT_STATUSES);
  });

  it("environment persistence loads alerts with the shared active status list", () => {
    const hookSrc = readFileSync("src/hooks/usePersistEnvironmentAlerts.ts", "utf8");
    expect(hookSrc).toMatch(
      /import\s+\{\s*ACTIVE_ALERT_STATUSES\s*\}\s+from\s+"@\/lib\/alertActiveStatusRules"/,
    );
    expect(hookSrc).toMatch(/listAlerts\(\{\s*growId,\s*statuses:\s*ACTIVE_ALERT_STATUSES\s*\}\)/);
  });
});
