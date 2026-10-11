/**
 * Blue Dream P2-2 on #1893: one tested helper decides the sensor-reading tent
 * scope for DailyGrowCheckStatusCard, GuidedActionChecklistPanel and Dashboard.
 * `null` tentIds = unresolved (pending, never "no readings"); `[]` = resolved
 * empty scope (no reads, no activity); a failed scope read is an error.
 */
import { describe, expect, it } from "vitest";
import { resolveSensorReadingTentScope } from "@/lib/tentScopedSensorReadingsRules";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const loaded = (ids: string[]) => ({ data: ids.map((id) => ({ id })), isError: false });
const loading = { data: undefined, isError: false };
const failed = { data: undefined, isError: true };

describe("resolveSensorReadingTentScope", () => {
  it("uses the loaded tents when no explicit caller scope is given", () => {
    expect(resolveSensorReadingTentScope({ tents: loaded([A, B]) })).toEqual({
      tentIds: [A, B],
      scopeError: false,
    });
  });

  it("is unresolved (null) while the tents read is loading", () => {
    expect(resolveSensorReadingTentScope({ tents: loading })).toEqual({
      tentIds: null,
      scopeError: false,
    });
  });

  it("is an error when the tents read fails, even with stale cached tents", () => {
    expect(resolveSensorReadingTentScope({ tents: { data: [{ id: A }], isError: true } })).toEqual({
      tentIds: null,
      scopeError: true,
    });
    expect(resolveSensorReadingTentScope({ tents: failed })).toEqual({
      tentIds: null,
      scopeError: true,
    });
  });

  it("treats an explicit null caller scope as unresolved, never as every tent", () => {
    expect(resolveSensorReadingTentScope({ explicitTentIds: null, tents: loaded([A, B]) })).toEqual(
      { tentIds: null, scopeError: false },
    );
  });

  it("treats an explicit [] caller scope as a resolved empty scope", () => {
    expect(resolveSensorReadingTentScope({ explicitTentIds: [], tents: loaded([A, B]) })).toEqual({
      tentIds: [],
      scopeError: false,
    });
  });

  it("uses an explicit caller scope as given and ignores the tents read state", () => {
    expect(resolveSensorReadingTentScope({ explicitTentIds: [B], tents: failed })).toEqual({
      tentIds: [B],
      scopeError: false,
    });
  });

  it("is an empty scope when the surface is disabled (no grow in scope)", () => {
    expect(resolveSensorReadingTentScope({ enabled: false, tents: failed })).toEqual({
      tentIds: [],
      scopeError: false,
    });
    expect(resolveSensorReadingTentScope({ enabled: false, tents: loading })).toEqual({
      tentIds: [],
      scopeError: false,
    });
  });
});
