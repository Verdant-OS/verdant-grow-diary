/**
 * Tests for the shared GrowDataSourceDisclosure presenter and its wiring
 * into the Plants and Tents pages.
 *
 * - Pure render tests verifying Live / Demo / Mixed / Unavailable labelling.
 * - Static contract tests for src/pages/Plants.tsx and src/pages/Tents.tsx.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

const ROOT = resolve(__dirname, "../..");
const PLANTS = readFileSync(resolve(ROOT, "src/pages/Plants.tsx"), "utf8");
const TENTS = readFileSync(resolve(ROOT, "src/pages/Tents.tsx"), "utf8");
const DISCLOSURE = readFileSync(
  resolve(ROOT, "src/components/GrowDataSourceDisclosure.tsx"),
  "utf8",
);

const meta = (
  dataSource: GrowDataSourceMeta["dataSource"],
  isDemoData = dataSource === "mock" || dataSource === "mixed",
): GrowDataSourceMeta => ({
  isDemoData,
  dataSource,
  sourceReason: "test",
});

describe("GrowDataSourceDisclosure (presenter)", () => {
  it("shows Demo badge for plants when metadata is mock-backed", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plants"
        hasAnyData
        metas={[meta("mock"), meta("mock")]}
        testId="plants-data-source-disclosure"
      />,
    );
    const b = screen.getByTestId("plants-data-source-disclosure-badge");
    expect(b.getAttribute("data-label")).toBe("Demo");
    expect(b).toHaveTextContent(/demo/i);
  });

  it("shows Mixed badge for tents when sources mix real and mock", () => {
    render(
      <GrowDataSourceDisclosure
        resource="tents"
        hasAnyData
        metas={[meta("supabase", false), meta("mock")]}
        testId="tents-data-source-disclosure"
      />,
    );
    const b = screen.getByTestId("tents-data-source-disclosure-badge");
    expect(b.getAttribute("data-label")).toBe("Mixed");
  });

  it("never shows Live for mock-backed plants metadata", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plants"
        hasAnyData
        metas={[meta("mock")]}
        testId="plants-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("plants-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).not.toBe("Live");
  });

  it("never shows Live for mock-backed tents metadata", () => {
    render(
      <GrowDataSourceDisclosure
        resource="tents"
        hasAnyData
        metas={[meta("mock")]}
        testId="tents-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("tents-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).not.toBe("Live");
  });

  it("shows welcome/empty state for plants when no usable real data exists", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plants"
        hasAnyData={false}
        metas={[meta("unavailable", false)]}
        testId="plants-data-source-disclosure"
      />,
    );
    const b = screen.getByTestId("plants-data-source-disclosure-badge");
    expect(b.getAttribute("data-label")).toBe("Unavailable");
    expect(
      screen.getByTestId("plants-data-source-disclosure"),
    ).toHaveTextContent(/no real plants/i);
  });

  it("shows welcome/empty state for tents when no usable real data exists", () => {
    render(
      <GrowDataSourceDisclosure
        resource="tents"
        hasAnyData={false}
        metas={[meta("unavailable", false)]}
        testId="tents-data-source-disclosure"
      />,
    );
    const b = screen.getByTestId("tents-data-source-disclosure-badge");
    expect(b.getAttribute("data-label")).toBe("Unavailable");
    expect(
      screen.getByTestId("tents-data-source-disclosure"),
    ).toHaveTextContent(/no real tents/i);
  });

  it("shows Live for fully supabase-backed metadata", () => {
    render(
      <GrowDataSourceDisclosure
        resource="plants"
        hasAnyData
        metas={[meta("supabase", false)]}
        testId="plants-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("plants-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Live");
  });
});

describe("Plants page wiring", () => {
  it("imports and renders GrowDataSourceDisclosure", () => {
    expect(PLANTS).toMatch(
      /from\s+["']@\/components\/GrowDataSourceDisclosure["']/,
    );
    expect(PLANTS).toMatch(/<GrowDataSourceDisclosure/);
  });

  it("uses real grow tent data (not mock useTents) for filter labels", () => {
    expect(PLANTS).not.toMatch(/from\s+["']@\/hooks\/useMockData["']/);
    expect(PLANTS).toMatch(/useGrowTents/);
  });

  it("reads classification metadata via getGrowDataMeta", () => {
    expect(PLANTS).toMatch(/getGrowDataMeta/);
  });

  it("does not introduce writes, service_role, or device control", () => {
    expect(PLANTS).not.toMatch(/service_role/);
    expect(PLANTS).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook/i,
    );
  });
});

describe("Tents page wiring", () => {
  it("imports and renders GrowDataSourceDisclosure", () => {
    expect(TENTS).toMatch(
      /from\s+["']@\/components\/GrowDataSourceDisclosure["']/,
    );
    expect(TENTS).toMatch(/<GrowDataSourceDisclosure/);
  });

  it("reads classification metadata via getGrowDataMeta", () => {
    expect(TENTS).toMatch(/getGrowDataMeta/);
  });

  it("does not introduce writes, service_role, or device control", () => {
    expect(TENTS).not.toMatch(/service_role/);
    expect(TENTS).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook/i,
    );
  });
});

describe("GrowDataSourceDisclosure source code", () => {
  it("delegates classification to combineGrowDataMeta", () => {
    expect(DISCLOSURE).toMatch(/combineGrowDataMeta/);
  });

  it("does not introduce writes or service_role", () => {
    expect(DISCLOSURE).not.toMatch(/service_role/);
    expect(DISCLOSURE).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
  });
});
