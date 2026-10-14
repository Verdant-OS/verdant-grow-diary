import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

function meta(sourceReason: string): GrowDataSourceMeta {
  return { isDemoData: false, dataSource: "unavailable", sourceReason };
}

describe("GrowDataSourceDisclosure record scope", () => {
  it("keeps the Unavailable badge when a record-scoped read has no rows", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plants"
        hasAnyData={false}
        metas={[meta("no-rows")]}
        emptyStateScope="record"
        testId="plants-data-source-disclosure"
      />,
    );
    expect(screen.getByText("This plant isn't available")).toBeTruthy();
    expect(screen.getByTestId("plants-data-source-disclosure-badge")).toHaveTextContent(
      /unavailable/i,
    );
    expect(
      screen.getByTestId("plants-data-source-disclosure").getAttribute("data-empty-reason"),
    ).toBe("unavailable");
  });
});
