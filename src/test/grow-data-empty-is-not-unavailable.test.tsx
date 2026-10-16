import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import GrowDataSourceDisclosure, {
  isSuccessfulEmptyGrowRead,
} from "@/components/GrowDataSourceDisclosure";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

function meta(sourceReason: string): GrowDataSourceMeta {
  return { isDemoData: false, dataSource: "unavailable", sourceReason };
}

describe("isSuccessfulEmptyGrowRead", () => {
  it("is true only when every meta is a successful empty read", () => {
    expect(isSuccessfulEmptyGrowRead([meta("no-rows"), meta("no-rows")])).toBe(true);
    expect(isSuccessfulEmptyGrowRead([])).toBe(false);
    expect(isSuccessfulEmptyGrowRead([meta("no-rows"), meta("fetch-error")])).toBe(false);
    expect(isSuccessfulEmptyGrowRead([meta("test")])).toBe(false);
    expect(isSuccessfulEmptyGrowRead([meta("fetch-error")])).toBe(false);
  });
});

describe("GrowDataSourceDisclosure empty account", () => {
  it("does not badge a new account's empty plants or tents as Unavailable", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plants"
        hasAnyData={false}
        metas={[meta("no-rows")]}
        testId="plants-data-source-disclosure"
      />,
    );
    expect(screen.getByText("No real plants yet")).toBeTruthy();
    expect(screen.queryByTestId("plants-data-source-disclosure-badge")).toBeNull();
    expect(
      screen.getByTestId("plants-data-source-disclosure").getAttribute("data-empty-reason"),
    ).toBe("no-rows");
  });

  it("keeps the Unavailable badge when the read failed", () => {
    render(
      <GrowDataSourceDisclosure
        resource="tents"
        hasAnyData={false}
        metas={[meta("no-rows"), meta("fetch-error")]}
        testId="tents-data-source-disclosure"
      />,
    );
    expect(screen.getByTestId("tents-data-source-disclosure-badge")).toHaveTextContent(
      /unavailable/i,
    );
  });

  it("keeps the badge for an unavailable reason that is not no-rows", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plants"
        hasAnyData={false}
        metas={[meta("test")]}
        testId="plants-data-source-disclosure"
      />,
    );
    expect(screen.getByTestId("plants-data-source-disclosure-badge")).toHaveTextContent(
      /unavailable/i,
    );
  });
});
