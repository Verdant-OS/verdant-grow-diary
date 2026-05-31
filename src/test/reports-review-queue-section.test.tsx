/**
 * Render tests for ReportsReviewQueueSection.
 *
 * - Returns null when there are no items (section hides).
 * - Renders each provided item with its CTA link.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReportsReviewQueueSection from "@/components/ReportsReviewQueueSection";
import type { ReportsReviewItem } from "@/lib/reportsHubReviewQueue";

function renderWith(items: ReportsReviewItem[]) {
  return render(
    <MemoryRouter>
      <ReportsReviewQueueSection items={items} />
    </MemoryRouter>,
  );
}

describe("ReportsReviewQueueSection", () => {
  it("renders nothing when there are no items", () => {
    const { container } = renderWith([]);
    expect(container.firstChild).toBeNull();
  });

  it("renders items and CTA links", () => {
    renderWith([
      {
        id: "missing_outcome",
        title: "Record outcomes",
        description: "1 completed action is waiting for an outcome note.",
        href: "/actions/abc",
        hrefLabel: "Open action",
      },
      {
        id: "open_alerts",
        title: "Review open alerts",
        description: "2 open environment alerts need a look.",
        href: "/alerts?growId=grow-1",
        hrefLabel: "Review alerts",
      },
    ]);
    expect(screen.getByTestId("reports-review-queue")).toBeInTheDocument();
    expect(
      screen.getByTestId("reports-review-item-missing_outcome"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("reports-review-link-missing_outcome").getAttribute("href"),
    ).toBe("/actions/abc");
    expect(
      screen.getByTestId("reports-review-link-open_alerts").getAttribute("href"),
    ).toBe("/alerts?growId=grow-1");
  });
});
