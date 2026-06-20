import { describe, expect, it } from "vitest";
import { classifyTimelineSensorSource } from "@/lib/timelineSensorSourceBadgeRules";

describe("timeline sensor source provenance aliases", () => {
  it("does not treat transport labels as canonical source labels", () => {
    expect(classifyTimelineSensorSource({ rawSource: "mqtt" }).kind).toBe("invalid");
    expect(classifyTimelineSensorSource({ rawSource: "api" }).kind).toBe("invalid");
    expect(classifyTimelineSensorSource({ rawSource: "import" }).kind).toBe("invalid");
    expect(classifyTimelineSensorSource({ rawSource: "unknown" }).kind).toBe("invalid");
  });
});
