/**
 * #550 — Pheno Hunts index card summary rules.
 *
 * The index once read "0 candidates" for a hunt whose four keepers were listed
 * in the stability panel directly above it. The count was the hunt's
 * NON-ARCHIVED plants; keepers outlive their archived source plants. These
 * rules name the count honestly and state the keeper count beside it.
 */
import { describe, it, expect } from "vitest";
import {
  buildPhenoHuntCardSummary,
  countKeepersByHunt,
  formatActiveCandidateCount,
  formatKeeperCount,
  keeperCountForHunt,
  keeperCountsFromRollup,
  KEEPER_STABILITY_ROLLUP_LIMIT,
} from "@/lib/phenoHuntsIndexCardRules";

describe("countKeepersByHunt", () => {
  it("counts keepers per hunt id", () => {
    const counts = countKeepersByHunt([
      { huntId: "h1" },
      { huntId: "h2" },
      { huntId: "h1" },
      { huntId: "h1" },
    ]);
    expect(counts.h1).toBe(3);
    expect(counts.h2).toBe(1);
  });

  it("skips rows with no usable hunt id instead of attributing them anywhere", () => {
    const counts = countKeepersByHunt([
      { huntId: null },
      { huntId: undefined },
      { huntId: "   " },
      { huntId: " h1 " },
    ]);
    expect(Object.keys(counts)).toEqual(["h1"]);
    expect(counts.h1).toBe(1);
  });

  it("returns an empty map for null, undefined, or non-array input", () => {
    expect(Object.keys(countKeepersByHunt(null))).toEqual([]);
    expect(Object.keys(countKeepersByHunt(undefined))).toEqual([]);
    expect(
      Object.keys(countKeepersByHunt("nope" as unknown as readonly { huntId: string }[])),
    ).toEqual([]);
  });

  it("never resolves an inherited Object.prototype key as a count", () => {
    const counts = countKeepersByHunt([{ huntId: "h1" }]);
    expect(keeperCountForHunt(counts, "constructor")).toBe(0);
    expect(keeperCountForHunt(counts, "toString")).toBe(0);
    expect(keeperCountForHunt(counts, "__proto__")).toBe(0);
  });

  it("is deterministic across repeated runs", () => {
    const rows = [{ huntId: "b" }, { huntId: "a" }, { huntId: "b" }];
    expect({ ...countKeepersByHunt(rows) }).toEqual({ ...countKeepersByHunt(rows) });
  });
});

describe("keeperCountForHunt", () => {
  it("returns null when the roll-up is unavailable — never a false zero", () => {
    expect(keeperCountForHunt(null, "h1")).toBeNull();
  });

  it("returns 0 for a hunt the available roll-up has no keepers for", () => {
    expect(keeperCountForHunt(countKeepersByHunt([]), "h1")).toBe(0);
  });
});

describe("count formatting", () => {
  it("pluralizes active candidates", () => {
    expect(formatActiveCandidateCount(0)).toBe("0 active candidates");
    expect(formatActiveCandidateCount(1)).toBe("1 active candidate");
    expect(formatActiveCandidateCount(48)).toBe("48 active candidates");
  });

  it("pluralizes keepers", () => {
    expect(formatKeeperCount(1)).toBe("1 keeper");
    expect(formatKeeperCount(4)).toBe("4 keepers");
  });
});

describe("buildPhenoHuntCardSummary", () => {
  it("#550 regression: keepers with zero active candidates read consistently", () => {
    const line = buildPhenoHuntCardSummary({
      activeCandidateCount: 0,
      keeperCount: 4,
      setupCompleted: true,
      startedLabel: "Jul 9, 2026",
    });
    expect(line).toBe("0 active candidates · 4 keepers · started Jul 9, 2026");
    // The contradictory pre-fix wording must not come back.
    expect(line).not.toMatch(/(^|\s)0 candidates/);
  });

  it("omits the keeper clause when the hunt has no keepers", () => {
    expect(
      buildPhenoHuntCardSummary({
        activeCandidateCount: 12,
        keeperCount: 0,
        setupCompleted: true,
        startedLabel: "Jun 1, 2026",
      }),
    ).toBe("12 active candidates · started Jun 1, 2026");
  });

  it("omits the keeper clause when the roll-up is unavailable — never '0 keepers'", () => {
    const line = buildPhenoHuntCardSummary({
      activeCandidateCount: 0,
      keeperCount: null,
      setupCompleted: true,
      startedLabel: "",
    });
    expect(line).toBe("0 active candidates");
    expect(line).not.toContain("keeper");
  });

  it("surfaces setup in progress and drops an unknown start date", () => {
    expect(
      buildPhenoHuntCardSummary({
        activeCandidateCount: 1,
        keeperCount: 1,
        setupCompleted: false,
        startedLabel: "",
      }),
    ).toBe("1 active candidate · 1 keeper · setup in progress");
  });
});

describe("keeperCountsFromRollup (Codex on #1825)", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ huntId: `h${i % 3}` }));

  it("counts when the roll-up is complete", () => {
    const counts = keeperCountsFromRollup(rows(5), { limit: 10, unavailable: false, total: 5 });
    expect(counts).not.toBeNull();
    expect(keeperCountForHunt(counts, "h0")).toBe(2);
  });

  it("returns null when the roll-up hit its cap (may be truncated), never an undercount", () => {
    expect(
      keeperCountsFromRollup(rows(10), { limit: 10, unavailable: false, total: null }),
    ).toBeNull();
    expect(
      keeperCountsFromRollup(rows(11), { limit: 10, unavailable: false, total: null }),
    ).toBeNull();
  });

  it("returns null when the server count is unknown or exceeds the rows read (lower server cap)", () => {
    expect(
      keeperCountsFromRollup(rows(5), { limit: 10, unavailable: false, total: null }),
    ).toBeNull();
    expect(keeperCountsFromRollup(rows(5), { limit: 10, unavailable: false, total: 6 })).toBeNull();
  });

  it("returns null when the roll-up read failed", () => {
    expect(keeperCountsFromRollup(rows(1), { limit: 10, unavailable: true, total: 1 })).toBeNull();
  });

  it("the service cap is exported and positive", () => {
    expect(KEEPER_STABILITY_ROLLUP_LIMIT).toBeGreaterThan(0);
  });
});
