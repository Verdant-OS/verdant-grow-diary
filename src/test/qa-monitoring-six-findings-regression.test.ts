import { describe, expect, it } from "vitest";
import { classifyDrybackSource } from "@/lib/drybackMonitoringRules";
import { classifySensorMetricState } from "@/lib/sensorMetricStateRules";
import { isQueryGrowScopeMismatch } from "@/lib/detailGrowScopeRules";
import { resolveDailyCheckActivityTarget } from "@/lib/dailyCheckWaterContextRules";
import { redactEvidenceValue } from "@/lib/ecowittValidationEvidenceRules";

describe("dryback source classification keeps hardware probes", () => {
  it.each(["ecowitt", "mqtt", "webhook", "home_assistant_bridge", "bridge"])(
    "%s is not invalid",
    (src) => expect(classifyDrybackSource(src)).toBe("live"),
  );
  it("unrecognized label is unknown, not invalid or live", () => {
    expect(classifyDrybackSource("mystery_device")).toBe("unknown");
  });
  it("literal invalid stays invalid", () => {
    expect(classifyDrybackSource("invalid")).toBe("invalid");
  });
});

describe("sensor metric state for hardware sources", () => {
  it("ecowitt reading is not labeled Invalid", () => {
    const state = classifySensorMetricState({ metric: "soil", value: 42, source: "ecowitt" } as never);
    expect(state.kind).not.toBe("invalid");
  });
});

describe("plant grow-scope mismatch", () => {
  it("null plant grow is not a mismatch", () => {
    expect(isQueryGrowScopeMismatch({ growId: null }, "g1")).toBe(false);
  });
  it("tent grow inherits scope", () => {
    expect(isQueryGrowScopeMismatch({ grow_id: null, tent: { grow_id: "g1" } }, "g1")).toBe(false);
    expect(isQueryGrowScopeMismatch({ grow_id: null, tent: { grow_id: "g2" } }, "g1")).toBe(true);
  });
  it("different own grow fails closed", () => {
    expect(isQueryGrowScopeMismatch({ growId: "g2" }, "g1")).toBe(true);
  });
});

describe("daily check tent pick after broken plant link", () => {
  it.each(["unknown", "out-of-scope"] as const)("%s keeps picked tent", (status) => {
    const r = resolveDailyCheckActivityTarget({
      standaloneTentId: "tent-1",
      firstSelectableTentId: "tent-1",
      pickedTentId: "tent-9",
      routeTentId: null,
      plantResolutionStatus: status,
    } as never);
    expect(r.tentId).toBe("tent-9");
  });
  it("without an explicit pick, no tent is invented", () => {
    const r = resolveDailyCheckActivityTarget({
      standaloneTentId: "tent-1",
      firstSelectableTentId: "tent-1",
      routeTentId: null,
      plantResolutionStatus: "unknown",
    } as never);
    expect(r.tentId).toBeNull();
  });
});

describe("ecowitt evidence redaction keeps batch payloads", () => {
  it("multi-reading array preserved, secrets redacted", () => {
    const out = redactEvidenceValue([{ temp: 20 }, { temp: 21, passkey: "abc" }]) as Array<
      Record<string, unknown>
    >;
    expect(out[0].temp).toBe(20);
    expect(out[1].temp).toBe(21);
    expect(out[1].passkey).toBe("[redacted]");
  });
  it("empty batch stays empty array", () => {
    expect(redactEvidenceValue([])).toEqual([]);
  });
});
