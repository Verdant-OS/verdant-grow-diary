/**
 * Static safeguard for the CI failure-artifact upload configuration of
 * `.github/workflows/one-tent-loop-proof-never-healthy.yml`.
 *
 * The never-healthy safety gate has to leave useful debug artifacts on
 * failure (sanitized proof text + Playwright HTML report + traces /
 * screenshots / videos / logs) so a regression can be inspected without
 * re-running the browser. This test verifies the workflow file:
 *
 *   - declares a failure-artifact upload gated on `if: failure()`
 *   - uses `if-no-files-found: ignore` so a partial run does not error
 *   - bundles every expected artifact path
 *   - never surfaces .env / service_role / bridge_token / raw_payload /
 *     access_token / api_key / SUPABASE_* secret paths in artifacts
 *
 * This is a pure text/YAML assertion — no CI run, no failed Playwright
 * spec required. Keeps the safeguard cheap and honest.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW_PATH = resolve(
  process.cwd(),
  ".github/workflows/one-tent-loop-proof-never-healthy.yml",
);

const yaml = readFileSync(WORKFLOW_PATH, "utf8");

const EXPECTED_FAILURE_ARTIFACT_NAME = "one-tent-loop-proof-never-healthy-failure-artifacts";

const EXPECTED_FAILURE_PATHS: readonly string[] = [
  "artifacts/one-tent-loop-proof/never-healthy-proof-report.txt",
  "playwright-report/**",
  "test-results/**/*.png",
  "test-results/**/*.webm",
  "test-results/**/*.zip",
  "test-results/**/trace.zip",
  "test-results/**/*.log",
];

const FORBIDDEN_ARTIFACT_FRAGMENTS: readonly RegExp[] = [
  /\.env\b/i,
  /service_role/i,
  /bridge_token/i,
  /raw_payload/i,
  /access_token/i,
  /\bapi[_-]?key\b/i,
  /SUPABASE_[A-Z_]+KEY/i,
  /\beyJ[A-Za-z0-9_-]{6,}/,
];

describe("one-tent-loop-proof-never-healthy.yml — failure artifact safeguard", () => {
  it("declares the expected failure-artifact upload step", () => {
    expect(yaml).toMatch(new RegExp(`name:\\s*${EXPECTED_FAILURE_ARTIFACT_NAME}`));
  });

  it("gates failure-artifact upload on `if: failure()`", () => {
    // Grab the block starting at the failure-artifact upload step through
    // the following blank line / next step boundary.
    const idx = yaml.indexOf(EXPECTED_FAILURE_ARTIFACT_NAME);
    expect(idx).toBeGreaterThan(-1);
    // Look backwards ~600 chars for the enclosing step.
    const stepBlock = yaml.slice(Math.max(0, idx - 800), idx + 1200);
    expect(stepBlock).toMatch(/if:\s*\$\{\{\s*failure\(\)\s*\}\}/);
  });

  it("uses `if-no-files-found: ignore` for failure-artifact upload", () => {
    const idx = yaml.indexOf(EXPECTED_FAILURE_ARTIFACT_NAME);
    const stepBlock = yaml.slice(idx, idx + 1600);
    expect(stepBlock).toMatch(/if-no-files-found:\s*ignore/);
  });

  it("bundles every expected artifact path in the failure-artifact upload", () => {
    const idx = yaml.indexOf(EXPECTED_FAILURE_ARTIFACT_NAME);
    const stepBlock = yaml.slice(idx, idx + 2000);
    for (const p of EXPECTED_FAILURE_PATHS) {
      expect(
        stepBlock.includes(p),
        `expected artifact path missing from failure upload: ${p}`,
      ).toBe(true);
    }
  });

  it("also uploads the sanitized proof artifact separately on always()", () => {
    // The sanitized proof upload is a separate always()-gated step so
    // successful runs still leave a copyable safety snapshot behind.
    expect(yaml).toMatch(/name:\s*one-tent-loop-proof-never-healthy-sanitized-proof/);
    // Find its step body and assert always() + the exact single-file path.
    const idx = yaml.indexOf("one-tent-loop-proof-never-healthy-sanitized-proof");
    const stepBlock = yaml.slice(Math.max(0, idx - 400), idx + 800);
    expect(stepBlock).toMatch(/if:\s*\$\{\{\s*always\(\)\s*\}\}/);
    expect(stepBlock).toMatch(
      /path:\s*artifacts\/one-tent-loop-proof\/never-healthy-proof-report\.txt/,
    );
  });

  it("never uploads .env / service_role / bridge_token / raw_payload / access_token / api_key paths", () => {
    // Extract only the artifact-upload blocks so we don't false-positive
    // on documentation comments. We scan any block that starts with
    // `upload-artifact` up to the next step boundary, and strip YAML
    // comments (lines starting with `#` or trailing `# ...`) so safety
    // notes that mention `.env`/`service_role`/etc. don't false-fail.
    // NOTE: `$` (not `\Z`) — JS regexes have no \Z, so the old escape
    // matched a literal "Z" and could truncate a block early.
    const uploadBlocks = yaml.match(/upload-artifact[\s\S]*?(?=\n\s{6}-\s|$)/g) ?? [];
    expect(uploadBlocks.length, "no upload-artifact steps found").toBeGreaterThan(0);
    for (const rawBlock of uploadBlocks) {
      const block = rawBlock
        .split("\n")
        .map((l) => l.replace(/#.*$/, ""))
        .join("\n");
      for (const re of FORBIDDEN_ARTIFACT_FRAGMENTS) {
        expect(
          re.test(block),
          `forbidden artifact fragment ${re} found in upload block:\n${block}`,
        ).toBe(false);
      }
    }
  });

  it("scopes triggers to the never-healthy proof surface (no unrelated code paths)", () => {
    // Sanity-check the paths filter still includes the proof surface so
    // the safeguard actually runs when someone edits the relevant code.
    expect(yaml).toMatch(/e2e\/one-tent-loop-proof-never-healthy\.spec\.ts/);
    expect(yaml).toMatch(/src\/pages\/OneTentLoopLiveProof\.tsx/);
    expect(yaml).toMatch(/src\/lib\/oneTentLoopProofRules\.ts/);
  });
});
