import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const CI = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8").replace(/\r\n/g, "\n");
const PACKAGE = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};

function stepBlock(name: string): string {
  const start = CI.indexOf(`      - name: ${name}`);
  expect(start).toBeGreaterThan(-1);
  const end = CI.indexOf("\n      - name:", start + 1);
  return CI.slice(start, end === -1 ? CI.length : end);
}

describe("Knowledge Library required CI wiring", () => {
  it("runs the complete knowledge validator unconditionally in the required test job", () => {
    const command = PACKAGE.scripts?.["knowledge:validate"] ?? "";
    for (const requiredScript of [
      "scripts/knowledge/validate-roadmap.mjs",
      "scripts/knowledge/validate-governance.mjs",
      "scripts/knowledge/validate-schemas.mjs",
      "node --test",
    ]) {
      expect(command).toContain(requiredScript);
    }
    const step = stepBlock("Knowledge Library contracts and append-only history");
    expect(step).toContain("run: bun run knowledge:validate");
    expect(step).toContain('KNOWLEDGE_HISTORY_REQUIRED: "true"');
    expect(step).not.toMatch(/continue-on-error|\n\s+if:/);

    const testJob = CI.slice(CI.indexOf("\n  test:"), CI.indexOf("\n  full-suite:"));
    expect(testJob.indexOf("Install dependencies")).toBeLessThan(
      testJob.indexOf("Knowledge Library contracts and append-only history"),
    );
    expect(testJob.indexOf("Knowledge Library contracts and append-only history")).toBeLessThan(
      testJob.indexOf("- name: Lint"),
    );
  });

  it("checks out history and passes the exact event base revision", () => {
    const testJob = CI.slice(CI.indexOf("\n  test:"), CI.indexOf("\n  full-suite:"));
    expect(testJob).toMatch(/uses: actions\/checkout@[\s\S]*fetch-depth: 0/);

    const step = stepBlock("Knowledge Library contracts and append-only history");
    expect(step).toContain("github.event.pull_request.base.sha");
    expect(step).toContain("github.event.merge_group.base_sha");
    expect(step).toContain("github.event.before");
  });

  it("keeps the repository-wide required workflow unfiltered", () => {
    const triggers = CI.slice(0, CI.indexOf("\njobs:"));
    expect(triggers).not.toMatch(/\n\s+paths:/);
    expect(triggers).not.toMatch(/\n\s+paths-ignore:/);
    for (const coveredPath of [
      "docs/knowledge-library/**",
      "scripts/knowledge/**",
      "package.json",
      "bun.lock",
      "package-lock.json",
    ]) {
      expect(triggers).toContain(coveredPath);
    }
  });
});
