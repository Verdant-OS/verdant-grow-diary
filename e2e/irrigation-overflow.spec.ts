// Browser overflow proof for the isolated StructuredWateringEntry surface.
//
// Mounts a standalone Vite fixture (no app routing — App.tsx/routes.ts are
// frozen). No auth, no Supabase writes (the writer is a no-op). Proves zero
// horizontal overflow at 320 / 375 / 390 / 768 / 1440 with a control-dense form.
//
// NOTE: cannot run on the authoring machine — the local vite dev server needs
// @resvg/resvg-js (absent from local node_modules). Runs in CI.
import { expect, test, type Page } from "@playwright/test";

const MOCKED_PROJECT = "chromium-mocked";
const FIXTURE = "/e2e/fixtures/irrigation-overflow.html";

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
    return {
      document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      body: { clientWidth: document.body.clientWidth, scrollWidth: document.body.scrollWidth },
      form: root ? { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth } : null,
    };
  });
}

function expectNoOverflow(m: Awaited<ReturnType<typeof readOverflow>>, label: string) {
  expect(m.document.scrollWidth, `document @ ${label}`).toBeLessThanOrEqual(m.document.clientWidth);
  expect(m.body.scrollWidth, `body @ ${label}`).toBeLessThanOrEqual(m.body.clientWidth);
  if (m.form) expect(m.form.scrollWidth, `form @ ${label}`).toBeLessThanOrEqual(m.form.clientWidth);
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
    expectNoOverflow(await readOverflow(page), vp.name);
  }
});
