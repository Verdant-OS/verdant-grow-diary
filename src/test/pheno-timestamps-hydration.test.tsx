/**
 * Pheno demo sensor times must hydrate cleanly when the SSR host and the
 * browser are in different time zones (#2349 review). The server renders a
 * zone-free placeholder; the browser formats local time after hydration.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import type { ReactElement } from "react";
import { MemoryRouter } from "@/lib/react-router-compat";

import ContextualPhenoComparisonPanel from "@/components/ContextualPhenoComparisonPanel";
import PhenoComparisonView from "@/components/PhenoComparisonView";
import { buildContextualPhenoComparisonView } from "@/lib/contextualPhenoComparisonViewModel";
import { CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS } from "@/lib/demo/contextualPhenoComparisonFixtures";
import { PHENO_COMPARISON_DEMO_CANDIDATES } from "@/lib/phenoComparisonFixtures";

const ORIGINAL_TZ = process.env.TZ;
const CLOCK = /\d{1,2}:\d{2}/;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
  document.body.innerHTML = "";
});

async function serverThenBrowser(element: ReactElement) {
  process.env.TZ = "UTC";
  const html = renderToString(element);
  process.env.TZ = "America/New_York";
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  const onRecoverableError = vi.fn();
  await act(async () => {
    hydrateRoot(container, element, { onRecoverableError });
  });
  return { html, container, onRecoverableError };
}

describe("Pheno demo sensor times across SSR and hydration", () => {
  it("ContextualPhenoComparisonPanel: zone-free SSR, local time after hydration", async () => {
    const view = buildContextualPhenoComparisonView(CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS);
    const { html, container, onRecoverableError } = await serverThenBrowser(
      <ContextualPhenoComparisonPanel view={view} />,
    );
    const ssr = document.createElement("div");
    ssr.innerHTML = html;
    expect(ssr.querySelector('[data-testid="plant-last-sensor-at"]')?.textContent).toBe("…");
    expect(onRecoverableError).not.toHaveBeenCalled();
    const alpha = container.querySelector(
      '[data-testid="contextual-pheno-comparison-plant-demo-plant-alpha"] [data-testid="plant-last-sensor-at"]',
    );
    // 2026-06-20T16:00Z is 12:00 PM in New York (EDT).
    expect(alpha?.textContent).toMatch(/12:00/);
  });

  it("PhenoComparisonView: zone-free SSR, local time after hydration", async () => {
    const element = (
      <MemoryRouter>
        <PhenoComparisonView inputs={PHENO_COMPARISON_DEMO_CANDIDATES} mode="demo" />
      </MemoryRouter>
    );
    const { html, container, onRecoverableError } = await serverThenBrowser(element);
    const ssr = document.createElement("div");
    ssr.innerHTML = html;
    expect(ssr.textContent ?? "").not.toMatch(/2026-06-20T/);
    expect(onRecoverableError).not.toHaveBeenCalled();
    // 2026-06-20T08:00Z is 4:00 AM in New York (EDT).
    expect(container.textContent ?? "").toMatch(/4:00/);
    expect(container.textContent ?? "").toMatch(CLOCK);
  });
});
