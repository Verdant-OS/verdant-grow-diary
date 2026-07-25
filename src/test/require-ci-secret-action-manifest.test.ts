import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const manifest = readFileSync(
  resolve(ROOT, ".github/actions/require-ci-secret/action.yml"),
  "utf8",
);

describe("require-ci-secret composite action manifest", () => {
  it("does not reference the unavailable secrets context", () => {
    expect(manifest).not.toMatch(/\$\{\{\s*secrets\./);
  });

  it("passes the caller-provided value into the preflight process", () => {
    expect(manifest).toContain("SECRET_VALUE: ${{ inputs.secret-value }}");
  });
});
