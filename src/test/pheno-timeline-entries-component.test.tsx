/**
 * C2 — PhenoTimelineEntries presenter.
 * Renders the view-model output; asserts titles, badges, empty state, and the
 * selfing "Self" detail. No direct Supabase in the presenter.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import PhenoTimelineEntries from "@/components/PhenoTimelineEntries";
import { buildPhenoTimelineEntries } from "@/lib/phenoTimelineEntriesViewModel";

describe("PhenoTimelineEntries", () => {
  it("renders the empty state when there are no entries", () => {
    render(<PhenoTimelineEntries entries={[]} />);
    expect(screen.getByTestId("pheno-timeline-empty")).toBeInTheDocument();
  });

  it("renders each entry with its title and badge", () => {
    const entries = buildPhenoTimelineEntries({
      keeperDecisions: [
        { id: "d1", decision: "keep", candidateLabel: "GMO #1", decidedAt: "2026-07-02T00:00:00Z" },
      ],
      crosses: [
        {
          id: "x2",
          femaleKeeperId: "mom",
          maleKeeperId: null,
          crossType: "selfing_s1",
          crossedAt: "2026-07-05T00:00:00Z",
        },
      ],
      keeperName: (id) => (id === "mom" ? "Gas" : null),
    });
    render(<PhenoTimelineEntries entries={entries} heading="Pheno activity" />);
    expect(screen.getByText("Pheno activity")).toBeInTheDocument();

    const cross = screen.getByTestId("pheno-timeline-entry-cross:x2");
    expect(cross).toHaveTextContent(/♀ Gas × Self/); // selfing → Self, never blank
    expect(within(cross).getByTestId("pheno-timeline-badge-cross:x2")).toHaveTextContent(/S1/);

    const decision = screen.getByTestId("pheno-timeline-entry-decision:d1");
    expect(decision).toHaveTextContent(/GMO #1: Keep/);
    expect(within(decision).getByTestId("pheno-timeline-badge-decision:d1")).toHaveTextContent(
      "Keep",
    );
  });

  it("shows a safe date label when the timestamp is missing", () => {
    const entries = buildPhenoTimelineEntries({
      crosses: [{ id: "x3", femaleKeeperId: "a", maleKeeperId: "b", crossType: "standard_f1" }],
    });
    render(<PhenoTimelineEntries entries={entries} />);
    expect(screen.getByTestId("pheno-timeline-entry-cross:x3")).toHaveTextContent(
      /date not recorded/,
    );
  });

  it("the presenter has no direct Supabase access", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/PhenoTimelineEntries.tsx"),
      "utf8",
    );
    // No supabase IMPORT (the docstring may mention the word) and no direct writes.
    expect(src).not.toMatch(/from\s+["'][^"']*supabase/i);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });
});
