/**
 * Operator Demo Preview — Evidence Label Polish v1.
 *
 * Locks in the presenter-only display label that replaces raw fixture refs
 * (e.g. "demo_reading_vpd_001") on /operator/demo-preview while leaving the
 * underlying evidence ref id intact for provenance equality.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({ status: "granted", granted: true, error: null }),
}));

import OperatorDemoPreview from "@/pages/OperatorDemoPreview";
import { buildOperatorDemoPreviewViewModel } from "@/lib/operatorDemoPreviewViewModel";
import { loadDemoEvidenceChainFixture } from "@/lib/demoEvidenceChainFixture";

afterEach(() => cleanup());

const RAW_FIXTURE_ID = "demo_reading_vpd_001";
const HUMAN_LABEL = "Sensor snapshot · Demo VPD reading";

function renderPage() {
  return render(
    <MemoryRouter>
      <OperatorDemoPreview />
    </MemoryRouter>,
  );
}

describe("OperatorDemoPreview evidence label polish", () => {
  it("renders the human-readable label in both evidence sections", () => {
    renderPage();
    const alert = screen.getByTestId("operator-demo-preview-alert");
    const action = screen.getByTestId("operator-demo-preview-action");
    expect(within(alert).getByText(HUMAN_LABEL)).toBeInTheDocument();
    expect(within(action).getByText(HUMAN_LABEL)).toBeInTheDocument();
  });

  it("does not render the raw fixture ref id anywhere on the page", () => {
    renderPage();
    expect(document.body.textContent ?? "").not.toContain(RAW_FIXTURE_ID);
    // Also: the legacy "sensor_snapshot demo_reading_vpd_001" pair must not appear.
    expect(document.body.textContent ?? "").not.toMatch(
      /sensor_snapshot\s+demo_reading_vpd_001/i,
    );
  });

  it("still keeps the Demo source badge visible on linked items", () => {
    renderPage();
    const items = screen.getAllByTestId("evidence-linkage-badges-source");
    expect(items.length).toBeGreaterThan(0);
    for (const node of items) {
      expect(node.textContent?.trim()).toBe("Demo");
    }
  });

  it("preserves the underlying ref id via data-event-id (provenance intact)", () => {
    renderPage();
    const items = screen.getAllByTestId("evidence-linkage-badges-item");
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.getAttribute("data-event-id")).toBe(RAW_FIXTURE_ID);
    }
  });

  it("view model exposes evidenceDisplayLabels without mutating evidenceRefs", () => {
    const fx = loadDemoEvidenceChainFixture();
    const vm = buildOperatorDemoPreviewViewModel();
    expect(vm.evidenceDisplayLabels[fx.reading.id]).toBe(HUMAN_LABEL);
    // Refs unchanged — same as raw fixture loader output.
    expect(vm.alert.evidenceRefs).toEqual(fx.alert.originating_timeline_events);
    expect(vm.action.evidenceRefs).toEqual(
      fx.action.originating_timeline_events,
    );
    expect(vm.alert.evidenceRefs[0].id).toBe(fx.reading.id);
  });
});
