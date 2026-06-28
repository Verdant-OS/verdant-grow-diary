/**
 * End-of-Run Grow Report — static safety scan.
 *
 * Scans the new report implementation files (by explicit path — never this
 * test file, which holds the forbidden-pattern list) for unsafe surfaces:
 * writes, RPC, fake exports, automation/device-control wording, certainty
 * claims, and "healthy" near degraded telemetry tokens.
 *
 * Guardrail/negation copy is allowed: a line that frames the forbidden
 * substring with an explicit negation ("do not" / "never" / "must not" /
 * "approval required" / "does not") is exempt, mirroring the allow-marker
 * pattern used by the other docs-safety scanners.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const IMPL_FILES = [
  "src/lib/endOfRunGrowReportViewModel.ts",
  "src/components/EndOfRunGrowReportPreview.tsx",
  "src/hooks/useEndOfRunGrowReportData.ts",
  "src/pages/EndOfRunGrowReportPreview.tsx",
] as const;

const FORBIDDEN_SUBSTRINGS = [
  "functions.invoke",
  ".insert(",
  ".update(",
  ".delete(",
  "upsert(",
  "download",
  "automatically execute",
  "auto execute",
  "automatically control",
  "device command",
  "send command",
  "execute command",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "guaranteed",
  "definitely",
  "certain diagnosis",
  "diagnosed from photo",
];

const ALLOW_LINE_RE = /do not|never|must not|approval required|does not/i;
const HEALTHY_RE = /\bhealthy\b/i;
const DEGRADED_RE = /\b(invalid|stale|demo|unknown|untrusted)\b/i;

describe("End-of-Run Grow Report static safety", () => {
  for (const rel of IMPL_FILES) {
    describe(rel, () => {
      const text = read(rel);
      const lines = text.split(/\r?\n/);

      it("contains no forbidden write/automation/certainty wording", () => {
        const violations: string[] = [];
        lines.forEach((line, i) => {
          if (ALLOW_LINE_RE.test(line)) return; // explicit negation/guardrail
          const lower = line.toLowerCase();
          for (const needle of FORBIDDEN_SUBSTRINGS) {
            if (lower.includes(needle)) {
              violations.push(`${rel}:${i + 1} [${needle}] ${line.trim()}`);
            }
          }
        });
        expect(violations).toEqual([]);
      });

      it("never places 'healthy' near a degraded telemetry token", () => {
        const violations: string[] = [];
        lines.forEach((line, i) => {
          if (ALLOW_LINE_RE.test(line)) return;
          if (HEALTHY_RE.test(line) && DEGRADED_RE.test(line)) {
            violations.push(`${rel}:${i + 1} ${line.trim()}`);
          }
        });
        expect(violations).toEqual([]);
      });
    });
  }

  it("the read-only hook performs reads only — no writes or RPC", () => {
    const hook = read("src/hooks/useEndOfRunGrowReportData.ts");
    expect(hook).toContain('from("grows")');
    expect(hook).toContain(".select(");
    expect(hook).not.toMatch(/\.insert\(|\.update\(|\.delete\(|upsert\(|functions\.invoke/);
    expect(hook).not.toMatch(/raw_payload|bridge_tokens|service_role/i);
  });

  it("the action-queue safety note keeps the approval-required posture", () => {
    const lib = read("src/lib/endOfRunGrowReportViewModel.ts");
    expect(lib).toContain("grower-approved");
    expect(lib).toMatch(/does not include device commands/i);
    expect(lib).toContain("It does not infer from missing data.");
  });

  it("the Pro export CTA is disabled and not a real export", () => {
    const component = read("src/components/EndOfRunGrowReportPreview.tsx");
    expect(component).toContain("disabled");
    expect(component).not.toMatch(/onClick=/);
    // The "coming soon" copy lives in the view-model constant.
    const lib = read("src/lib/endOfRunGrowReportViewModel.ts");
    expect(lib).toMatch(/coming soon/i);
  });
});
