import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import {
  HOT_PATHS,
  classifyHotPaths,
  computeOverlaps,
  parseMaxPrs,
  renderText,
  runAudit,
} from "../../scripts/ci/pr-file-overlap-audit.mjs";

const FIXED_NOW = new Date("2026-09-29T14:20:00.000Z");

describe("pr-file-overlap-audit: classifyHotPaths", () => {
  it("returns [] for null, undefined, and empty input", () => {
    expect(classifyHotPaths(null)).toEqual([]);
    expect(classifyHotPaths(undefined)).toEqual([]);
    expect(classifyHotPaths("")).toEqual([]);
  });

  it("matches by prefix and by substring, in HOT_PATHS order", () => {
    expect(classifyHotPaths(".github/workflows/ci.yml")).toEqual(["ci-runners"]);
    expect(classifyHotPaths("docs/agents/CURRENT_STATE.md")).toEqual(["architecture-docs"]);
    expect(classifyHotPaths("src/lib/entitlements/capabilities.ts")).toEqual(["billing"]);
    expect(classifyHotPaths("src/lib/quicklog/rememberedTarget.ts")).toEqual(["quick-log"]);
    expect(classifyHotPaths("supabase/migrations/20260901_signup_hardening.sql")).toEqual([
      "signup-migration-hardening",
    ]);
  });

  it("matches by substring alone, outside every prefix", () => {
    expect(classifyHotPaths("docs/x/ARCHITECTURE.md")).toEqual(["architecture-docs"]);
    expect(classifyHotPaths("src/pages/billing-settings.tsx")).toEqual(["billing"]);
    expect(classifyHotPaths("src/components/quick-log/Button.tsx")).toEqual(["quick-log"]);
  });

  it("does not flag ordinary product files", () => {
    expect(classifyHotPaths("src/components/PlantCard.tsx")).toEqual([]);
    expect(classifyHotPaths("README.md")).toEqual([]);
  });

  it("keeps HOT_PATHS keys unique", () => {
    const keys = HOT_PATHS.map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("pr-file-overlap-audit: computeOverlaps", () => {
  it("happy path: finds the shared file and the hot collision", () => {
    const report = computeOverlaps(
      [
        { number: 10, title: "a", files: ["src/a.ts", "src/lib/entitlements/x.ts"] },
        { number: 12, title: "b", files: ["src/b.ts", "src/lib/entitlements/x.ts"] },
        { number: 11, title: "c", files: ["src/c.ts"] },
      ],
      FIXED_NOW,
    );
    expect(report.pr_count).toBe(3);
    expect(report.generated_at).toBe(FIXED_NOW.toISOString());
    expect(report.overlapping_pairs).toEqual([
      { a: 10, b: 12, shared: ["src/lib/entitlements/x.ts"], hot: ["billing"] },
    ]);
    expect(report.hot_collisions).toHaveLength(1);
    expect(report.files_by_pr_count).toEqual([
      { file: "src/lib/entitlements/x.ts", prs: [10, 12], hot: ["billing"] },
    ]);
    expect(report.prs.map((p) => p.number)).toEqual([10, 11, 12]);
  });

  it("boundary: no overlap yields empty collections, not errors", () => {
    const report = computeOverlaps(
      [
        { number: 1, files: ["a"] },
        { number: 2, files: ["b"] },
      ],
      FIXED_NOW,
    );
    expect(report.overlapping_pairs).toEqual([]);
    expect(report.files_by_pr_count).toEqual([]);
    expect(report.hot_collisions).toEqual([]);
  });

  it("keeps an overlapping pair with no hot files out of hot_collisions", () => {
    const report = computeOverlaps(
      [
        { number: 20, files: ["src/components/PlantCard.tsx", "src/lib/billing/plan.ts"] },
        { number: 21, files: ["src/components/PlantCard.tsx"] },
        { number: 22, files: ["src/lib/billing/plan.ts"] },
      ],
      FIXED_NOW,
    );
    expect(report.overlapping_pairs.map((p) => `${p.a}:${p.b}`)).toEqual(["20:21", "20:22"]);
    expect(report.hot_collisions.map((p) => `${p.a}:${p.b}`)).toEqual(["20:22"]);
    expect(report.hot_collisions.find((p) => p.b === 21)).toBeUndefined();
  });

  it("invalid/null input is tolerated: non-array, null PRs, missing files, junk entries", () => {
    expect(computeOverlaps(null as never, FIXED_NOW).pr_count).toBe(0);
    expect(computeOverlaps(undefined as never, FIXED_NOW).pr_count).toBe(0);
    const report = computeOverlaps(
      [
        null,
        { number: "x" },
        { number: 5 },
        { number: 6, files: [null, "", 42, "shared.ts"] },
        { number: 7, files: ["shared.ts"] },
      ] as never,
      FIXED_NOW,
    );
    expect(report.pr_count).toBe(3);
    expect(report.overlapping_pairs).toEqual([{ a: 6, b: 7, shared: ["shared.ts"], hot: [] }]);
    expect(report.prs.find((p) => p.number === 5)?.file_count).toBe(0);
  });

  it("determinism: input order does not change output", () => {
    const prs = [
      { number: 3, files: ["z", "y"] },
      { number: 1, files: ["y", "x"] },
      { number: 2, files: ["x", "z"] },
    ];
    const a = computeOverlaps(prs, FIXED_NOW);
    const b = computeOverlaps([...prs].reverse(), FIXED_NOW);
    expect(a).toEqual(b);
    expect(a.overlapping_pairs.map((p) => `${p.a}:${p.b}`)).toEqual(["1:2", "1:3", "2:3"]);
  });

  it("safety fence: output carries no write intent (no comment/label/assign fields)", () => {
    const report = computeOverlaps([{ number: 1, files: ["a"] }], FIXED_NOW);
    const keys = Object.keys(report);
    for (const forbidden of ["comment", "labels", "assignees", "merge", "reviewers"]) {
      expect(keys).not.toContain(forbidden);
    }
    const text = renderText(report);
    expect(text).toContain("read-only evidence");
    expect(text).toContain("does not decide ownership");
  });
});

describe("pr-file-overlap-audit: workflow contract", () => {
  const wf = yaml.load(
    readFileSync(join(process.cwd(), ".github/workflows/pr-file-overlap-audit.yml"), "utf8"),
  ) as {
    on: Record<string, unknown>;
    permissions: Record<string, string>;
    jobs: Record<string, { steps: Array<{ uses?: string; run?: string }> }>;
  };

  it("is schedule + dispatch only and read-only", () => {
    expect(Object.keys(wf.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
    expect(wf.permissions).toEqual({ contents: "read", "pull-requests": "read" });
  });

  it("never invokes a mutating gh command", () => {
    const runs = Object.values(wf.jobs)
      .flatMap((j) => j.steps)
      .map((s) => s.run ?? "")
      .join("\n");
    expect(runs).not.toMatch(/gh pr (comment|edit|merge|review|close|ready)/);
    expect(runs).not.toMatch(/gh (issue|label)/);
    expect(runs).not.toMatch(/-X (POST|PATCH|PUT|DELETE)/);
  });

  it("never interpolates inputs or event data into a run: script", () => {
    const runs = Object.values(wf.jobs)
      .flatMap((j) => j.steps)
      .map((s) => s.run ?? "")
      .join("\n");
    expect(runs).not.toMatch(/\$\{\{\s*(inputs|github\.event)/);
  });
});

describe("pr-file-overlap-audit: runAudit exit codes", () => {
  const hot = () => [
    { number: 1, files: ["src/lib/billing/plan.ts"] },
    { number: 2, files: ["src/lib/billing/plan.ts"] },
  ];
  const cold = () => [
    { number: 1, files: ["src/components/PlantCard.tsx"] },
    { number: 2, files: ["src/components/PlantCard.tsx"] },
  ];
  const quiet = { log: () => {}, error: () => {}, write: () => {}, now: FIXED_NOW };

  it("returns 4 with --fail-on-hot when a hot collision exists", () => {
    expect(runAudit({ ...quiet, args: ["--fail-on-hot"], fetchPrs: hot })).toBe(4);
  });

  it("returns 0 for a hot collision without --fail-on-hot", () => {
    expect(runAudit({ ...quiet, args: [], fetchPrs: hot })).toBe(0);
  });

  it("returns 0 with --fail-on-hot when overlaps are not hot", () => {
    expect(runAudit({ ...quiet, args: ["--fail-on-hot"], fetchPrs: cold })).toBe(0);
  });

  it("returns 2 when fetching PRs fails", () => {
    const fetchPrs = () => {
      throw new Error("gh: network down");
    };
    expect(runAudit({ ...quiet, args: [], fetchPrs })).toBe(2);
  });

  it("writes json and text outputs when asked", () => {
    const written: Record<string, string> = {};
    const write = (p: string, d: string) => {
      written[p] = d;
    };
    runAudit({ ...quiet, write, args: ["--json-out", "o.json", "--text-out", "o.txt"], fetchPrs: hot });
    expect(JSON.parse(written["o.json"]).hot_collisions).toHaveLength(1);
    expect(written["o.txt"]).toContain("HOT-PATH COLLISIONS");
  });
});

describe("pr-file-overlap-audit: parseMaxPrs", () => {
  it("accepts positive integers and falls back to 100 otherwise", () => {
    expect(parseMaxPrs("25")).toBe(25);
    expect(parseMaxPrs(undefined)).toBe(100);
    expect(parseMaxPrs("")).toBe(100);
    expect(parseMaxPrs("abc")).toBe(100);
    expect(parseMaxPrs("0")).toBe(100);
    expect(parseMaxPrs("-3")).toBe(100);
    expect(parseMaxPrs("2.5")).toBe(100);
  });
});
