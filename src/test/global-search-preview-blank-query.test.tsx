import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import GlobalSearchResultPreview from "@/components/GlobalSearchResultPreview";
import type { GlobalSearchResult } from "@/lib/globalSearchResults";

const row: GlobalSearchResult = {
  entity_type: "tent",
  id: "tent-1",
  label: "North Tent",
  sublabel: "Flower room",
  match_kind: "prefix",
  rank: 1,
  score: 0.42,
};

afterEach(cleanup);

function renderPreview(query: string) {
  render(
    <GlobalSearchResultPreview
      row={row}
      routePath="/grows/g1/tents/tent-1"
      query={query}
      onOpen={() => {}}
    />,
  );
  return screen.getByTestId("global-search-preview");
}

describe("global search preview query metadata", () => {
  it.each(["", " \t\r\n "])("omits the entire metadata wrapper for blank query %j", (query) => {
    const preview = renderPreview(query);

    expect(preview).toHaveAttribute("data-state", "result");
    expect(preview).toHaveAccessibleName("Preview of Tent North Tent");
    expect(screen.getByTestId("global-search-preview-label")).toHaveTextContent("North Tent");
    expect(screen.queryByTestId("global-search-preview-match-kind")).not.toBeInTheDocument();
  });

  it("preserves trimmed query text and diagnostic attributes without exposing diagnostic text", () => {
    const preview = renderPreview(" \tNorth \n ");
    const metadata = screen.getByTestId("global-search-preview-match-kind");

    expect(metadata).toHaveAttribute("data-testid", "global-search-preview-match-kind");
    expect(metadata.textContent).toBe("for \u201cNorth\u201d");
    expect(metadata).toHaveAttribute("data-match-kind", "prefix");
    expect(metadata).toHaveAttribute("data-rank", "1");
    expect(metadata).toHaveAttribute("data-score", "0.42");
    expect(metadata).not.toHaveAttribute("aria-label");
    expect(preview).toHaveAttribute("data-state", "result");
    expect(preview).toHaveAccessibleName("Preview of Tent North Tent");
    expect(screen.getByTestId("global-search-preview-label")).toHaveTextContent("North Tent");
    expect(preview.textContent).not.toMatch(/prefix|rank|score|r1[\u00b7\u2219]|0\.42/i);

    for (const element of [preview, ...preview.querySelectorAll("[aria-label]")]) {
      expect(element.getAttribute("aria-label") ?? "").not.toMatch(
        /prefix|rank|score|r1[\u00b7\u2219]|0\.42/i,
      );
    }
  });
});
