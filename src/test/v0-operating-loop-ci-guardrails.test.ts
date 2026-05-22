/**
 * Static guardrails for the V0 operating loop:
 *   - PR template references the contract test and loop touch-points
 *   - CI workflow runs the contract test and full vitest suite
 *   - CI workflow does not introduce automation / device-control surface
 *   - Demo doc marks the contract test as stop-ship
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const TEMPLATE = resolve(root, ".github/pull_request_template.md");
const WORKFLOW = resolve(root, ".github/workflows/ci.yml");
const DOC = resolve(root, "docs/v0-operating-loop-demo.md");
const CONTRACT = resolve(root, "src/test/v0-operating-loop-contract.test.ts");

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

describe("V0 operating loop — CI / PR guardrails", () => {
  it("the contract test file still exists", () => {
    expect(existsSync(CONTRACT)).toBe(true);
  });

  describe("PR template references the V0 loop", () => {
    const t = read(TEMPLATE);

    it("references the contract test path", () => {
      expect(t).toContain("src/test/v0-operating-loop-contract.test.ts");
    });

    it("references the demo / loop doc", () => {
      expect(t).toContain("docs/v0-operating-loop-demo.md");
    });

    it("has a V0 Operating Loop impact section", () => {
      expect(t).toMatch(/##\s+V0 Operating Loop impact/i);
    });

    it.each([
      /Sensor readings/i,
      /Dashboard latest environment/i,
      /Environment alerts/i,
      /Alert persistence/i,
      /AlertDetail/,
      /ActionQueue/,
      /ActionDetail/,
      /Action Queue transitions/i,
      /AI Coach.*Action Queue/i,
    ])("includes loop touch-point checkbox %s", (re) => {
      expect(t).toMatch(new RegExp(`- \\[ \\].*${re.source}`, re.flags));
    });
  });

  describe("CI workflow", () => {
    const w = read(WORKFLOW);

    it("exists at .github/workflows/ci.yml", () => {
      expect(existsSync(WORKFLOW)).toBe(true);
    });

    it("runs on pull_request and push to main", () => {
      expect(w).toMatch(/pull_request:/);
      expect(w).toMatch(/push:/);
      expect(w).toMatch(/branches:\s*\[\s*main\s*\]/);
    });

    it("invokes the V0 contract test explicitly", () => {
      expect(w).toContain("src/test/v0-operating-loop-contract.test.ts");
    });

    it("runs the full vitest suite", () => {
      expect(w).toMatch(/bunx vitest run\b/);
    });

    it("does not depend on external secrets", () => {
      expect(w).not.toMatch(/\$\{\{\s*secrets\./);
    });

    it.each([
      "service_role",
      "MQTT",
      "Home Assistant",
      "relay",
      "actuator",
      "webhook",
      "Leads",
      "typed_watering",
      "device_command",
    ])("does not reference forbidden surface %s", (term) => {
      expect(w.toLowerCase()).not.toContain(term.toLowerCase());
    });
  });

  describe("Demo doc marks the contract as stop-ship", () => {
    const d = read(DOC);

    it("has a V0 contract test section calling out stop-ship", () => {
      expect(d).toMatch(/V0 contract test/i);
      expect(d).toMatch(/stop-ship/i);
    });

    it("references the contract test path and CI workflow", () => {
      expect(d).toContain("src/test/v0-operating-loop-contract.test.ts");
      expect(d).toContain(".github/workflows/ci.yml");
    });
  });
});
