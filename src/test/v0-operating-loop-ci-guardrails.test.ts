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
    const wRaw = read(WORKFLOW);

    // Strip YAML `#` comment lines so safety-describing comments (which
    // intentionally name what other scanners check for — service_role,
    // mqtt, actuator, device_command, etc.) cannot trigger this scanner.
    // Then strip any `if:`-gated step block: those steps are
    // documented-optional (e.g. staging Supabase runtime harnesses) and
    // do NOT make the default PR pipeline depend on external secrets.
    const stripYamlComments = (s: string) =>
      s
        .split("\n")
        .filter((l) => !/^\s*#/.test(l))
        .join("\n");
    const stripIfGatedSteps = (s: string) => {
      const lines = s.split("\n");
      const out: string[] = [];
      let dropping = false;
      let dropIndent = 0;
      for (const line of lines) {
        const stepStart = /^(\s*)-\s+name:\s/.exec(line);
        if (stepStart) {
          const indent = stepStart[1].length;
          if (dropping && indent <= dropIndent) dropping = false;
        }
        if (!dropping) out.push(line);
        if (/^\s+if:\s*\$\{\{\s*env\./.test(line) && stepStart === null) {
          // Walk back to find the enclosing step start indent.
          for (let i = out.length - 1; i >= 0; i--) {
            const m = /^(\s*)-\s+name:\s/.exec(out[i]);
            if (m) {
              dropping = true;
              dropIndent = m[1].length;
              // Remove the step header we just kept; we want to drop the
              // whole gated step block including its `- name:` line.
              out.splice(i, out.length - i);
              break;
            }
          }
        }
      }
      return out.join("\n");
    };
    const w = stripIfGatedSteps(stripYamlComments(wRaw));

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

    it("the default PR pipeline does not depend on external secrets (gated optional steps are excluded)", () => {
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
    ])("does not reference forbidden surface %s in active (non-comment, non-gated) workflow steps", (term) => {
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
