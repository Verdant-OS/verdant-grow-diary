import { describe, expect, it } from "vitest";
// @ts-expect-error — mjs script without types; tests verify exported behavior.
import { scanText, formatViolation, RULES } from "../../scripts/assert-release-docs-safety.mjs";

describe("release-docs safety scanner", () => {
  it("passes a clean safe release doc", () => {
    const safe = `# Example Safe Release

This is a docs/test-only slice. No live telemetry was added.
Imported CSV history is not live telemetry; current manual or live
readings are still required for confident diagnosis.
No device control. No automation. No import writes.
Vendor secrets and bridge tokens must not render.
Action Queue remains approval-required; nothing is auto-created.
AI Doctor behavior was not changed.
`;
    expect(scanText(safe)).toEqual([]);
  });

  it("flags an unsafe live-import claim with rule name and line number", () => {
    const bad = `# Bad
Line one is fine.
We added live import support for CSV history.
`;
    const v = scanText(bad);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("no-live-import-claim");
    expect(v[0].line).toBe(3);
    const formatted = formatViolation("docs/releases/example.md", v[0]);
    expect(formatted).toContain("docs/releases/example.md:3");
    expect(formatted).toContain("[no-live-import-claim]");
  });

  it("flags an unsafe device-control claim with file and line", () => {
    const bad = `# Bad
Device control was added in this release.
`;
    const v = scanText(bad);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("no-device-control");
    expect(v[0].line).toBe(2);
  });

  it("does not flag explicit safe negations", () => {
    const safe = `Not live telemetry.
No device control was added.
Does not expose secrets or tokens.
Vendor secrets must not render.
This release guards against exposed raw payloads.
`;
    expect(scanText(safe)).toEqual([]);
  });

  it("flags Action Queue auto-writes", () => {
    const bad = `Action Queue rows are automatically created from alerts now.`;
    const v = scanText(bad);
    expect(v.some((x) => x.rule === "no-action-queue-auto-write")).toBe(true);
  });

  it("exposes a stable rule catalog", () => {
    const names = RULES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length); // unique
    expect(names).toContain("no-live-import-claim");
    expect(names).toContain("no-device-control");
    expect(names).toContain("no-action-queue-auto-write");
    expect(names).toContain("no-service-role-leak");
  });
});
