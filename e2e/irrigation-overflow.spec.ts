// Browser overflow proof for the isolated StructuredWateringEntry surface.
//
// Mounts a standalone Vite fixture (no app routing — App.tsx/routes.ts are
// frozen). No auth, no Supabase writes (the writer is a no-op). Proves zero
// horizontal overflow at 320 / 375 / 390 / 768 / 1440 with a control-dense form.
//
// Runs locally and in CI after the frozen dependency install. The fixture
// imports Verdant's production stylesheet so Tailwind layout classes are real.
import { expect, test, type Page } from "@playwright/test";

const MOCKED_PROJECT = "chromium-mocked";
const FIXTURE = "/e2e/fixtures/irrigation-overflow.html";
const LONG_NOTE =
  "A-very-long-unbroken-root-zone-observation-that-must-wrap-without-forcing-the-structured-watering-form-off-a-glove-friendly-phone-screen";

const VIEWPORTS: ReadonlyArray<{ name: string; width: number; height: number }> = [
  { name: "xs-320", width: 320, height: 640 },
  { name: "sm-375", width: 375, height: 812 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

async function readOverflow(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-testid='structured-watering-entry']");
    const grid = root?.querySelector<HTMLElement>(".grid") ?? null;
    const firstControl = root?.querySelector<HTMLElement>("input") ?? null;
    return {
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      body: { clientWidth: document.body.clientWidth, scrollWidth: document.body.scrollWidth },
      form: root ? { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth } : null,
      styles: {
        rootMinWidth: root ? getComputedStyle(root).minWidth : null,
        gridDisplay: grid ? getComputedStyle(grid).display : null,
        gridTemplateColumns: grid ? getComputedStyle(grid).gridTemplateColumns : null,
        firstControlMinHeight: firstControl ? getComputedStyle(firstControl).minHeight : null,
      },
    };
  });
}

function expectNoOverflow(m: Awaited<ReturnType<typeof readOverflow>>, label: string) {
  expect(m.document.scrollWidth, `document @ ${label}`).toBeLessThanOrEqual(m.document.clientWidth);
  expect(m.body.scrollWidth, `body @ ${label}`).toBeLessThanOrEqual(m.body.clientWidth);
  if (m.form) expect(m.form.scrollWidth, `form @ ${label}`).toBeLessThanOrEqual(m.form.clientWidth);
}

function expectVerdantCssApplied(
  m: Awaited<ReturnType<typeof readOverflow>>,
  expectedColumns: number,
  label: string,
) {
  expect(m.styles.rootMinWidth, `min-w-0 @ ${label}`).toBe("0px");
  expect(m.styles.gridDisplay, `grid display @ ${label}`).toBe("grid");
  expect(m.styles.firstControlMinHeight, `44px control @ ${label}`).toBe("44px");
  const columns = m.styles.gridTemplateColumns?.trim().split(/\s+/).filter(Boolean) ?? [];
  expect(columns, `responsive columns @ ${label}`).toHaveLength(expectedColumns);
}

test("StructuredWateringEntry has zero horizontal overflow at every width", async ({ page }) => {
  test.skip(
    test.info().project.name !== MOCKED_PROJECT,
    `irrigation overflow proof runs once, under the ${MOCKED_PROJECT} project`,
  );
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(FIXTURE);
    await page.getByTestId("structured-watering-entry").waitFor({ state: "visible" });
    await page.locator("#swe-volumeMl").fill("1000");
    await page.locator("#swe-note").fill(LONG_NOTE);
    await expect(page.getByTestId("watering-review")).toContainText(LONG_NOTE);
    const measurements = await readOverflow(page);
    expectVerdantCssApplied(measurements, vp.width >= 1024 ? 3 : vp.width >= 640 ? 2 : 1, vp.name);
    expectNoOverflow(measurements, vp.name);
  }
});
