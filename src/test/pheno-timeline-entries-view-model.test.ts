/**
 * C2 — pheno timeline entries view-model.
 *
 * Proves the pure mapping of pheno records → timeline entries: human titles,
 * badges, selfing "Self" rendering, herm surfacing, and most-recent-first
 * ordering with undated entries last. Pure — no React, no Supabase.
 */
import { describe, it, expect } from "vitest";
import {
  buildPhenoTimelineEntries,
  type PhenoTimelineInput,
} from "@/lib/phenoTimelineEntriesViewModel";

const names: Record<string, string> = { mom: "Gas", dad: "Dessert", rev: "Reversed Fem" };
const keeperName = (id: string) => names[id] ?? null;

describe("buildPhenoTimelineEntries — mapping", () => {
  it("maps a sex observation, flagging herm", () => {
    const [e] = buildPhenoTimelineEntries({
      sexObservations: [
        { id: "s1", sex: "hermaphrodite", hermObserved: true, observedAt: "2026-07-01T00:00:00Z" },
      ],
    });
    expect(e.kind).toBe("sex_observation");
    expect(e.title).toMatch(/Hermaphrodite/);
    expect(e.badge).toBe("Herm");
    expect(e.id).toBe("sex:s1");
  });

  it("maps a plain female sex observation", () => {
    const [e] = buildPhenoTimelineEntries({
      sexObservations: [{ id: "s2", sex: "female", observedAt: "2026-07-01T00:00:00Z" }],
    });
    expect(e.title).toMatch(/Sex recorded: Female/);
    expect(e.badge).toBe("Female");
  });

  it("prefixes a sex observation with its candidate label when provided", () => {
    const [e] = buildPhenoTimelineEntries({
      sexObservations: [
        { id: "s3", sex: "female", candidateLabel: "GMO #2", observedAt: "2026-07-01T00:00:00Z" },
      ],
    });
    expect(e.title).toBe("GMO #2 — Sex recorded: Female");
    expect(e.badge).toBe("Female");
  });

  it("maps a keeper decision with candidate label and badge", () => {
    const [e] = buildPhenoTimelineEntries({
      keeperDecisions: [
        { id: "d1", decision: "keep", candidateLabel: "GMO #1", decidedAt: "2026-07-02T00:00:00Z" },
      ],
    });
    expect(e.kind).toBe("keeper_decision");
    expect(e.title).toMatch(/GMO #1: Keep/);
    expect(e.badge).toBe("Keep");
  });

  it("maps a reversal with the method label and keeper name", () => {
    const [e] = buildPhenoTimelineEntries({
      reversals: [{ id: "r1", keeperId: "rev", method: "sts", appliedAt: "2026-07-03T00:00:00Z" }],
      keeperName,
    });
    expect(e.kind).toBe("reversal");
    expect(e.title).toMatch(/Reversal applied — Reversed Fem/);
    expect(e.badge).toMatch(/STS/);
  });

  it("maps a standard cross with both keeper names and an F1 badge", () => {
    const [e] = buildPhenoTimelineEntries({
      crosses: [
        {
          id: "x1",
          femaleKeeperId: "mom",
          maleKeeperId: "dad",
          crossType: "standard_f1",
          crossedAt: "2026-07-04T00:00:00Z",
        },
      ],
      keeperName,
    });
    expect(e.kind).toBe("cross");
    expect(e.title).toMatch(/Gas × Dessert/);
    expect(e.detail).toMatch(/♀ Gas × Dessert/);
    expect(e.badge).toBe("F1");
  });

  it("renders a selfing (null male) cross donor as Self with an S1 badge — never blank", () => {
    const [e] = buildPhenoTimelineEntries({
      crosses: [
        {
          id: "x2",
          femaleKeeperId: "mom",
          maleKeeperId: null,
          crossType: "selfing_s1",
          crossedAt: "2026-07-05T00:00:00Z",
        },
      ],
      keeperName,
    });
    expect(e.detail).toMatch(/♀ Gas × Self/);
    expect(e.detail).not.toMatch(/×\s*$/);
    expect(e.badge).toMatch(/S1/);
  });

  it("falls back to the standard 'unknown keeper' placeholder when a name is unknown", () => {
    const [e] = buildPhenoTimelineEntries({
      crosses: [
        { id: "x3", femaleKeeperId: "ghost", maleKeeperId: "dad", crossType: "standard_f1" },
      ],
      keeperName,
    });
    expect(e.title).toMatch(/unknown keeper × Dessert/);
    expect(e.title).not.toMatch(/undefined|null|a keeper/);
  });

  it("labels an undecided keeper decision via the shared model", () => {
    const [e] = buildPhenoTimelineEntries({
      keeperDecisions: [{ id: "d2", decision: "undecided", decidedAt: "2026-07-02T00:00:00Z" }],
    });
    expect(e.title).toMatch(/Undecided/);
    expect(e.badge).toBe("Undecided");
  });

  it("uses createdAt when the grower-set date is null (recorded event, not undated)", () => {
    const [e] = buildPhenoTimelineEntries({
      reversals: [
        {
          id: "r9",
          keeperId: "rev",
          method: "sts",
          appliedAt: null,
          createdAt: "2026-07-09T00:00:00Z",
        },
      ],
      keeperName,
    });
    expect(e.occurredAt).toBe("2026-07-09T00:00:00Z");
  });
});

describe("buildPhenoTimelineEntries — ordering", () => {
  const input: PhenoTimelineInput = {
    sexObservations: [{ id: "s", sex: "female", observedAt: "2026-07-01T00:00:00Z" }],
    keeperDecisions: [{ id: "d", decision: "keep", decidedAt: "2026-07-05T00:00:00Z" }],
    reversals: [{ id: "r", keeperId: "k", method: "sts", appliedAt: "2026-07-03T00:00:00Z" }],
    crosses: [
      {
        id: "x",
        femaleKeeperId: "k",
        maleKeeperId: null,
        crossType: "selfing_s1",
        crossedAt: null,
      },
    ],
  };

  it("sorts most-recent first and puts undated entries last", () => {
    const out = buildPhenoTimelineEntries(input);
    expect(out.map((e) => e.kind)).toEqual([
      "keeper_decision", // 07-05
      "reversal", // 07-03
      "sex_observation", // 07-01
      "cross", // undated → last
    ]);
  });

  it("is deterministic across repeated calls", () => {
    expect(buildPhenoTimelineEntries(input)).toEqual(buildPhenoTimelineEntries(input));
  });

  it("returns [] for empty input", () => {
    expect(buildPhenoTimelineEntries({})).toEqual([]);
  });
});
