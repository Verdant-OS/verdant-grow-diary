import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Real-browser accessibility regression for the two public Pheno evidence
 * demos. jsdom cannot calculate rendered color contrast, so these rules must
 * run against the built CSS in Chromium.
 *
 * Safety: both routes are fixture-only, read-only, and mounted without auth.
 * The spec performs no writes and sends no network requests beyond the page
 * navigation itself.
 */

const AXE_PATH = path.resolve("node_modules/axe-core/axe.min.js");

const ROUTES = ["/pheno-comparison", "/pheno-expression-showcase"] as const;

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 900 },
  { name: "desktop-1280", width: 1280, height: 900 },
] as const;

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{
    target: unknown;
    failureSummary?: string;
  }>;
}

async function runFocusedAxe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: AXE_PATH });

  return page.evaluate(async () => {
    const root = document.querySelector("#root");
    if (!root) throw new Error("Pheno accessibility check requires #root.");

    const axe = (
      window as typeof window & {
        axe: {
          run: (context: Element, options: unknown) => Promise<{ violations: AxeViolation[] }>;
        };
      }
    ).axe;

    const results = await axe.run(root, {
      runOnly: {
        type: "rule",
        values: ["color-contrast", "list", "listitem"],
      },
      resultTypes: ["violations"],
    });

    return results.violations;
  });
}

function formatViolations(violations: AxeViolation[]): string {
  return violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? "unknown"}): ${violation.nodes
          .map((node) => JSON.stringify(node.target))
          .join(", ")}`,
    )
    .join("\n");
}

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    test(`${route} has valid list semantics and readable evidence states @ ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(route);
      await expect(page.getByTestId("pheno-comparison-page")).toBeVisible();

      const violations = await runFocusedAxe(page);
      expect(violations.length, formatViolations(violations)).toBe(0);
    });
  }
}
