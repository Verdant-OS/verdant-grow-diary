import type { Page } from "@playwright/test";

/**
 * Identity of every visible Log control (links and buttons named Log, Quick
 * Log or Open Quick Log; not Log out or Start Check), sorted: its test ID,
 * or for an untagged control its landmark label and href. GDP D1.1-A/D1.2-A
 * (docs/specs/dashboard-single-log-entry-readiness-marker.md): the page body
 * shows only the home card's Log; AppShell's chrome triggers are named
 * exemptions. A new duplicate fails the exact set.
 */
export async function visibleLogControls(page: Page): Promise<string[]> {
  const name = /^(open )?(quick )?log$/i;
  const ids: string[] = [];
  for (const role of ["link", "button"] as const) {
    // One atomic read per role: a re-render between per-index reads could
    // otherwise count a control twice or skip it.
    const roleIds = await page
      .getByRole(role, { name })
      .filter({ visible: true })
      .evaluateAll((elements) =>
        elements.map((element) => {
          const testId = element.getAttribute("data-testid");
          if (testId) return testId;
          const landmark = element.closest("nav, header, main, aside")?.getAttribute("aria-label");
          return `${landmark ?? "unlabelled region"} > ${element.getAttribute("href") ?? element.tagName}`;
        }),
      );
    ids.push(...roleIds);
  }
  return ids.sort();
}
