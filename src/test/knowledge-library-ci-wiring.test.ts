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
      "scripts/knowledge/validate-corpus.test.mjs",
      "node --test",
    ]) {
      expect(command).toContain(requiredScript);
    }
    expect(command).not.toContain("--baseline-file");
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

  it("resolves a trusted base commit for every workflow event after the full checkout", () => {
    const testJob = CI.slice(CI.indexOf("\n  test:"), CI.indexOf("\n  full-suite:"));
    expect(testJob).toMatch(/uses: actions\/checkout@[\s\S]*fetch-depth: 0/);

    const resolver = stepBlock("Resolve exact Knowledge Library base revision");
    expect(testJob.indexOf("fetch-depth: 0")).toBeLessThan(
      testJob.indexOf("Resolve exact Knowledge Library base revision"),
    );
    expect(testJob.indexOf("Resolve exact Knowledge Library base revision")).toBeLessThan(
      testJob.indexOf("Knowledge Library contracts and append-only history"),
    );
    expect(resolver).toContain("github.event.pull_request.base.sha");
    expect(resolver).toContain("github.event.merge_group.base_ref");
    expect(resolver).not.toContain("github.event.merge_group.base_sha");
    expect(resolver).toContain("github.event.before");
    for (const eventName of ["pull_request", "merge_group", "push", "workflow_dispatch"]) {
      expect(resolver).toContain(`${eventName})`);
    }
    expect(resolver).toContain('git check-ref-format "$MERGE_GROUP_BASE_REF"');
    expect(resolver).toContain(
      'remote_base_ref="refs/remotes/origin/${MERGE_GROUP_BASE_REF#refs/heads/}"',
    );
    expect(resolver).toContain('git merge-base "$GITHUB_SHA" "$remote_base_ref"');
    expect(resolver).toContain("refs/heads/main|refs/heads/verdant-grow-diary)");
    // Protected targets still use first-parent; feature-branch dispatch resolves
    // the open PR base so required gate can run when pull_request events lag.
    expect(resolver).toContain('git rev-parse --verify "${GITHUB_SHA}^1"');
    expect(resolver).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/pulls?head=${GITHUB_REPOSITORY_OWNER}:${branch}&state=open"',
    );
    expect(resolver).toContain("GH_TOKEN: ${{ github.token }}");
    expect(resolver).toContain('git cat-file -e "${candidate}^{commit}"');
    expect(resolver).toContain('echo "base_revision=$resolved" >> "$GITHUB_OUTPUT"');

    const validation = stepBlock("Knowledge Library contracts and append-only history");
    expect(validation).toContain(
      "KNOWLEDGE_BASE_REVISION: ${{ steps.knowledge-base.outputs.base_revision }}",
    );
    expect(validation).not.toContain("github.event.pull_request.base.sha");
    expect(validation).not.toContain("github.event.merge_group.base_sha");
    expect(validation).not.toContain("github.event.before");
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
