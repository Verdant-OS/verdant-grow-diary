/**
 * Filming bug #4 (2026-10-22): the Pheno demo pages printed raw UTC ISO
 * strings ("2026-06-20T08:00:00.000Z") for sensor snapshot times. They now
 * use the shared local formatter (`formatSnapshotTimestamp`).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import PhenoComparison from "@/pages/PhenoComparison";
import ContextualPhenoComparisonDemo from "@/pages/ContextualPhenoComparisonDemo";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";

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

afterEach(() => cleanup());

describe("Pheno demo timestamps are local, never raw UTC ISO", () => {
  it("/pheno-comparison sensor snapshots", () => {
    const text = pageText(PhenoComparison);
    expect(text).not.toMatch(RAW_ISO);
    expect(text).toContain(formatSnapshotTimestamp("2026-06-20T08:00:00.000Z"));
  });

  it("contextual pheno comparison demo 'Last sensor'", () => {
    const text = pageText(ContextualPhenoComparisonDemo);
    expect(text).not.toMatch(RAW_ISO);
    expect(text).toContain(`Last sensor: ${formatSnapshotTimestamp("2026-06-20T16:00:00.000Z")}`);
  });
});
