/**
 * Global search diary spec — LIKE literal escape: executable spec example
 * (requirement 1), not coverage.
 *
 * Diary search must match `%`, `_`, and `\` literally in grower text. This file
 * spells out the expected pattern for each case with a local copy of the rule;
 * it cannot fail if the real helper drifts. The implementing slice owns the
 * real test: the RPC fixtures in the spec's acceptance list (`100%` must not
 * match `100 ml`). Shared semantics: escapePostgrestLikeLiteral in
 * usePlantAssignedTentActions.
 */
import { describe, expect, it } from "vitest";

/** Expected escape for diary / PostgREST ilike patterns (spec requirement 1). */
function escapeDiaryLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function diaryPattern(query: string): string {
  return `%${escapeDiaryLikeLiteral(query)}%`;
}

describe("global search diary LIKE escape spec example", () => {
  it("escapes wildcards and backslash so 100% does not match 100 ml", () => {
    expect(diaryPattern("100%")).toBe("%100\\%%");
  });

  it("escapes underscore so a_b matches only the literal a_b", () => {
    expect(diaryPattern("a_b")).toBe("%a\\_b%");
  });

  it("escapes backslash in c:\\x style notes", () => {
    expect(diaryPattern(String.raw`c:\x`)).toBe(String.raw`%c:\\x%`);
  });
});
