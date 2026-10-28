/**
 * Filming bug #4 (2026-10-22): the Pheno demo pages printed raw UTC ISO
 * strings ("2026-06-20T08:00:00.000Z") for sensor snapshot times. They now
 * use the shared local formatter (`formatSnapshotTimestamp`).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import PhenoComparison from "@/pages/PhenoComparison";
import ContextualPhenoComparisonDemo from "@/pages/ContextualPhenoComparisonDemo";

const RAW_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function pageText(Page: () => JSX.Element | null): string {
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return container.textContent ?? "";
}

const ORIGINAL_TZ = process.env.TZ;

// Pin a non-UTC zone so a formatter that rendered UTC would fail.
beforeEach(() => {
  process.env.TZ = "America/Chicago";
});

afterEach(() => {
  cleanup();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("Pheno demo timestamps are local, never raw UTC ISO", () => {
  it("/pheno-comparison sensor snapshots", () => {
    const text = pageText(PhenoComparison);
    expect(text).not.toMatch(RAW_ISO);
    // 08:00Z is 3:00 AM in Chicago (CDT).
    expect(text).toContain("Jun 20, 2026, 3:00 AM");
  });

  it("contextual pheno comparison demo 'Last sensor'", () => {
    const text = pageText(ContextualPhenoComparisonDemo);
    expect(text).not.toMatch(RAW_ISO);
    // 16:00Z is 11:00 AM in Chicago (CDT).
    expect(text).toContain("Last sensor: Jun 20, 2026, 11:00 AM");
  });
});
