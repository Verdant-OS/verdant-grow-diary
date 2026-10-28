/**
 * Contract test for owner-approved CodeRabbit review controls (PR #2309).
 *
 * Parses the committed `.coderabbit.yaml` and asserts on resolved values so a
 * comment-out or typo cannot silently re-enable author self-approval or disable
 * draft reviews.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type CodeRabbitConfig = {
  reviews?: {
    allow_author_approval?: boolean;
    auto_review?: {
      enabled?: boolean;
      drafts?: boolean;
    };
    pre_merge_checks?: {
      override_requested_reviewers_only?: boolean;
    };
  };
};

function loadCodeRabbitConfig(): CodeRabbitConfig {
  const raw = readFileSync(resolve(process.cwd(), ".coderabbit.yaml"), "utf8");
  const parsed = load(raw);
  expect(parsed).toBeTruthy();
  expect(typeof parsed).toBe("object");
  return parsed as CodeRabbitConfig;
}

describe("CodeRabbit review controls contract", () => {
  it("keeps auto-review enabled for drafts and non-drafts", () => {
    const config = loadCodeRabbitConfig();
    expect(config.reviews?.auto_review?.enabled).toBe(true);
    expect(config.reviews?.auto_review?.drafts).toBe(true);
  });

  it("prohibits authors from approving their own pull requests", () => {
    const config = loadCodeRabbitConfig();
    expect(config.reviews?.allow_author_approval).toBe(false);
  });

  it("restricts pre-merge reviewer overrides to requested reviewers only", () => {
    const config = loadCodeRabbitConfig();
    expect(config.reviews?.pre_merge_checks?.override_requested_reviewers_only).toBe(true);
  });
});
