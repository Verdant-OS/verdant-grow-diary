/**
 * Resolved-config boundary for the lockfile transition review date.
 *
 * The repository-state case in check-bun-lockfile-policy.test.ts evaluates a
 * fixed date (2026-07-25). This file loads the real transition config and runs
 * evaluatePolicy on reviewBy and the following UTC day, so a change to the
 * deadline or its fail-closed boundary is visible.
 *
 * Codex P2 on #1965. AGENTS.md contract tests assert resolved values.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../../scripts/check-bun-lockfile-policy.mjs";

const REPO_ROOT = resolve(__dirname, "../..");
const TRANSITION_PATH = resolve(REPO_ROOT, "config/dependency-lockfile-transition.json");

type TransitionConfig = {
  owner: string;
  reviewBy: string;
};

type PolicyResult = {
  ok: boolean;
  errors: string[];
  transition: { owner: string; reviewBy: string; consumers: string[] };
};

function loadTransitionConfig(): TransitionConfig {
  const parsed: unknown = JSON.parse(readFileSync(TRANSITION_PATH, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { owner?: unknown }).owner !== "string" ||
    typeof (parsed as { reviewBy?: unknown }).reviewBy !== "string"
  ) {
    throw new Error("dependency-lockfile-transition.json is missing owner or reviewBy");
  }
  return {
    owner: (parsed as { owner: string }).owner,
    reviewBy: (parsed as { reviewBy: string }).reviewBy,
  };
}

/** Next UTC calendar day. Matches requireIsoDate, which parses YYYY-MM-DD at T00:00:00.000Z. */
function nextUtcCalendarDay(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate) {
    throw new Error(`reviewBy is not a UTC calendar date: ${isoDate}`);
  }
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function evaluateRepository(today: string): PolicyResult {
  return evaluatePolicy({ cwd: REPO_ROOT, today }) as PolicyResult;
}

describe("dependency lockfile reviewBy boundary", () => {
  const transition = loadTransitionConfig();
  const reviewBy = transition.reviewBy;
  const dayAfterReviewBy = nextUtcCalendarDay(reviewBy);
  const overdueReviewError = `Lockfile transition review is overdue (owner=${transition.owner}, reviewBy=${reviewBy}).`;

  it("pins reviewBy to 2026-10-17 and passes the repository policy on that date", () => {
    expect(reviewBy).toBe("2026-10-17");
    expect(dayAfterReviewBy).toBe("2026-10-18");

    const onDeadline = evaluateRepository(reviewBy);

    expect(onDeadline.ok).toBe(true);
    expect(onDeadline.errors).toEqual([]);
    expect(onDeadline.transition.reviewBy).toBe(reviewBy);
    expect(onDeadline.transition.owner).toBe(transition.owner);
  }, 20_000);

  it("fails closed the day after reviewBy with only the overdue-review error", () => {
    const afterDeadline = evaluateRepository(dayAfterReviewBy);

    expect(afterDeadline.ok).toBe(false);
    expect(afterDeadline.errors).toEqual([overdueReviewError]);
    expect(afterDeadline.transition.reviewBy).toBe(reviewBy);
  }, 20_000);
});
