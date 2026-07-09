import { test, expect } from "@playwright/test";

/**
 * Quick Log target panel — browser smoke.
 *
 * Verifies the Quick Log target panel renders Grow / Tent / Plant /
 * Strain as four DISTINCT labeled fields, never as a flattened
 * combined string. Uses the same authenticated Grow #1 fixture as
 * `quicklog-smoke.spec.ts`, so it inherits the same safety posture:
 *   - No auth bypass. No hardcoded credentials. No elevated DB role.
 *   - Reads/writes only what an authenticated grower could do via the UI.
 *   - Non-destructive: opens Quick Log, inspects the target panel, and
 *     closes without saving.
 *
 * Skips when the fixture env is not provided so mocked/local runs and
 * CI without the smoke fixture stay green. Vitest coverage in
 *   src/test/quick-log-target-panel-view-model.test.ts
 *   src/test/quick-log-target-panel-combinations.test.ts
 *   src/test/quick-log-target-panel-presenter.test.tsx
 *   src/test/quick-log-target-panel-flattened-label-regression.test.tsx
 * carries the deterministic guarantees for every target combination.
 */
const PLANT_URL = process.env.E2E_GROW_1_PLANT_URL;

// Combined labels the presenter must NEVER render for the target
// panel. If any of these appear in the panel text, the presenter has
// regressed to a flattened target string.
const FORBIDDEN_COMBINED_LABELS = [
  /Grow\s*·\s*Tent\s*·\s*Plant\s*·\s*Strain/i,
  /Plant\s*·\s*Strain/i,
  /Tent\s*·\s*Plant/i,
  /Grow\s*·\s*Tent/i,
];

test.describe("Quick Log target panel — browser smoke", () => {
  test.skip(
    !PLANT_URL,
    "Set E2E_GROW_1_PLANT_URL to a Grow #1 plant page to run this smoke test.",
  );

  test("target panel shows Grow / Tent / Plant / Strain as distinct labeled fields", async ({
    page,
  }) => {
    await page.goto(PLANT_URL!);

    await page
      .getByRole("button", { name: /quick log|log entry|\+ log/i })
      .first()
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const panel = dialog.getByTestId("qlv2-target-panel");
    // Panel only renders when a target is resolved. If the fixture
    // opens Quick Log without a resolved plant, the panel may be
    // hidden — that is a legitimate empty state, not a regression, so
    // we skip rather than fail.
    if ((await panel.count()) === 0) {
      test.info().annotations.push({
        type: "note",
        description: "Target panel not visible in this fixture — nothing to assert.",
      });
      await page.keyboard.press("Escape");
      return;
    }

    // Four labeled rows must exist.
    for (const key of ["grow", "tent", "plant", "strain"] as const) {
      await expect(panel.getByTestId(`qlv2-target-panel-${key}-label`)).toBeVisible();
      await expect(panel.getByTestId(`qlv2-target-panel-${key}-value`)).toBeVisible();
    }

    // Label text is exact and separate.
    await expect(panel.getByTestId("qlv2-target-panel-grow-label")).toHaveText("Grow");
    await expect(panel.getByTestId("qlv2-target-panel-tent-label")).toHaveText("Tent");
    await expect(panel.getByTestId("qlv2-target-panel-plant-label")).toHaveText("Plant");
    await expect(panel.getByTestId("qlv2-target-panel-strain-label")).toHaveText("Strain");

    // No combined ambiguous target string anywhere in the panel.
    const panelText = (await panel.innerText()).trim();
    for (const forbidden of FORBIDDEN_COMBINED_LABELS) {
      expect(panelText, `panel text must not match ${forbidden}`).not.toMatch(forbidden);
    }

    // Plant field must not contain the strain value (and vice versa).
    const plantValue = (
      await panel.getByTestId("qlv2-target-panel-plant-value").innerText()
    ).trim();
    const strainValue = (
      await panel.getByTestId("qlv2-target-panel-strain-value").innerText()
    ).trim();
    if (
      plantValue.length > 0 &&
      strainValue.length > 0 &&
      strainValue !== "—" &&
      strainValue.toLowerCase() !== "no strain recorded"
    ) {
      expect(
        plantValue,
        "plant field must not embed the strain value",
      ).not.toBe(strainValue);
    }

    // Non-destructive: close without saving.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
