import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { SmokeChecklistReporter } from "./lib/smokeChecklistReporter";

/**
 * Authenticated Quick Log smoke checklist.
 *
 * This is the source of truth for browser-level keyboard/click flows
 * (Tab order, focus targets, post-save navigation). Vitest covers
 * deterministic component behavior but cannot prove real browser focus.
 *
 * Required env (or pre-generated storageState — see e2e/README.md):
 *   E2E_TEST_EMAIL, E2E_TEST_PASSWORD
 *
 * Optional env:
 *   E2E_BASE_URL                (default http://localhost:5173)
 *   E2E_GROW_1_PLANT_URL        URL of the Grow #1 plant page to open first
 *   E2E_GROW_2_PLANT_NAME       Display name of the target plant in Grow #2
 *                               (default "505 Headbanger")
 *
 * SAFETY:
 *   - No auth bypass. No hardcoded credentials. No elevated DB role.
 *   - Reads/writes only what an authenticated user could do via the UI.
 *   - Does not attach stale/non-usable snapshots.
 */
const PLANT_URL = process.env.E2E_GROW_1_PLANT_URL;
const TARGET_NAME = process.env.E2E_GROW_2_PLANT_NAME ?? "505 Headbanger";

const RESULTS_DIR = path.resolve(process.cwd(), "e2e/results");
const REPORT_JSON = path.join(RESULTS_DIR, "quicklog-smoke-report.json");
const REPORT_TXT = path.join(RESULTS_DIR, "quicklog-smoke-report.txt");

test.describe("Quick Log smoke checklist", () => {
  test.skip(
    !PLANT_URL,
    "Set E2E_GROW_1_PLANT_URL to a Grow #1 plant page to run this smoke test.",
  );

  test("authenticated end-to-end checklist", async ({ page }, testInfo) => {
    const report = new SmokeChecklistReporter();

    try {
      await page.goto(PLANT_URL!);

      await page
        .getByRole("button", { name: /quick log|log entry|\+ log/i })
        .first()
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      const plantSelect = dialog.getByTestId("quick-log-plant-select");
      await plantSelect.click();
      await page
        .getByRole("option", { name: new RegExp(TARGET_NAME, "i") })
        .click();

      await report.run(4, "Mismatch banner appears", async () => {
        await expect(
          dialog.getByTestId("quick-log-plant-mismatch-banner"),
        ).toBeVisible();
        return "banner visible";
      });

      await report.run(5, "Review Quick Log issues region appears", async () => {
        await expect(dialog.getByTestId("quick-log-review-issues")).toBeVisible();
        return "review region visible";
      });

      await report.run(6, "Tab reaches issue links", async () => {
        await dialog.getByTestId("quick-log-plant-select").focus();
        for (let i = 0; i < 12; i++) {
          await page.keyboard.press("Tab");
          const id = await page.evaluate(
            () => (document.activeElement as HTMLElement | null)?.dataset?.testid ?? "",
          );
          if (id?.startsWith("quick-log-review-jump-")) return `focused ${id}`;
        }
        throw new Error("Did not reach review jump link via Tab");
      });

      await report.run(7, "Activate plant-mismatch jump link", async () => {
        await dialog.getByTestId("quick-log-review-jump-mismatch").click();
        return "activated";
      });

      await report.run(8, "Focus moves to plant selector", async () => {
        await expect(dialog.getByTestId("quick-log-plant-select")).toBeFocused();
        return "plant select focused";
      });

      await report.run(9, "Stale snapshot helper shows captured timestamp", async () => {
        const helper = dialog.getByTestId("quick-log-snapshot-stale-helper");
        if ((await helper.count()) === 0) {
          report.skip(9, "Stale helper not present for this fixture", "no stale snapshot");
          return "skipped (no stale snapshot)";
        }
        await expect(helper).toContainText(/captured|ago|\d/i);
        return "helper text present";
      });

      await report.run(10, "Activate stale-snapshot jump link", async () => {
        const link = dialog.getByTestId("quick-log-review-jump-snapshot");
        if ((await link.count()) === 0) return "no snapshot jump link (acceptable)";
        await link.click();
        return "activated";
      });

      await report.run(11, "Focus moves to attach snapshot section", async () => {
        const section = dialog.getByTestId("quick-log-snapshot-attach-section");
        if ((await section.count()) === 0) return "no attach section (acceptable)";
        await expect(section).toBeFocused();
        return "attach section focused";
      });

      await report.run(12, "Select Watering event type", async () => {
        await dialog.getByRole("button", { name: /watering/i }).first().click();
        return "watering selected";
      });

      await report.run(13, "Leave Watering (ml) blank", async () => {
        const ml = dialog.getByTestId("quicklog-watering-ml");
        await expect(ml).toHaveValue("");
        return "ml empty";
      });

      await report.run(14, "Click Save with missing watering ml", async () => {
        await dialog.getByTestId("quick-log-save").click();
        return "save clicked";
      });

      await report.run(15, "Inline error appears + focus on Watering (ml)", async () => {
        await expect(dialog.getByTestId("quicklog-watering-error")).toBeVisible();
        await expect(dialog.getByTestId("quicklog-watering-ml")).toBeFocused();
        return "error visible, ml focused";
      });

      await report.run(16, "Add watering ml", async () => {
        await dialog.getByTestId("quicklog-watering-ml").fill("250");
        return "filled 250";
      });

      await report.run(17, "Save", async () => {
        await dialog.getByTestId("quick-log-save").click();
        await expect(dialog.getByTestId("quick-log-post-save")).toBeVisible({
          timeout: 15_000,
        });
        return "post-save shown";
      });

      await report.run(18, "Post-save actions visible (View / Log another / Close)", async () => {
        await expect(dialog.getByTestId("quick-log-view-target-plant")).toBeVisible();
        await expect(dialog.getByTestId("quick-log-post-save-another")).toBeVisible();
        await expect(dialog.getByTestId("quick-log-post-save-close")).toBeVisible();
        return "all three actions visible";
      });

      await report.run(19, "Tab reaches Log another", async () => {
        await dialog.getByTestId("quick-log-view-target-plant").focus();
        await page.keyboard.press("Tab");
        await expect(dialog.getByTestId("quick-log-post-save-another")).toBeFocused();
        return "focused";
      });

      const selectedPlantId = await dialog
        .getByTestId("quick-log-view-target-plant")
        .getAttribute("data-target-plant-id");

      await report.run(20, "Activate Log another", async () => {
        await dialog.getByTestId("quick-log-post-save-another").click();
        return "activated";
      });

      await report.run(21, "Same target plant remains selected", async () => {
        await expect(dialog.getByTestId("quick-log-post-save")).toHaveCount(0);
        await expect(dialog.getByTestId("quick-log-plant-select")).toContainText(
          new RegExp(TARGET_NAME, "i"),
        );
        return `kept plant ${selectedPlantId ?? "(unknown id)"}`;
      });

      await report.run(22, "Form resets, focus lands in note field", async () => {
        await expect(dialog.getByTestId("quicklog-note")).toBeFocused();
        await expect(dialog.getByTestId("quicklog-note")).toHaveValue("");
        return "note focused, empty";
      });

      await report.run(23, "Save quick Observation", async () => {
        await dialog.getByTestId("quicklog-note").fill("Smoke checklist observation");
        await dialog.getByTestId("quick-log-save").click();
        await expect(dialog.getByTestId("quick-log-post-save")).toBeVisible({
          timeout: 15_000,
        });
        return "second save succeeded";
      });

      await report.run(24, "Close and reopen Quick Log", async () => {
        await dialog.getByTestId("quick-log-post-save-close").click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await page
          .getByRole("button", { name: /quick log|log entry|\+ log/i })
          .first()
          .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        return "reopened";
      });

      await report.run(25, "No stale post-save state on reopen", async () => {
        const reopened = page.getByRole("dialog");
        await expect(reopened.getByTestId("quick-log-post-save")).toHaveCount(0);
        await expect(reopened.getByTestId("quicklog-note")).toHaveValue("");
        return "clean dialog";
      });
    } finally {
      // Always write the smoke report to a stable path so CI can upload it
      // even when a step fails. Mirrored copy into testInfo.outputDir for
      // Playwright's per-test artifact bundle.
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
      const json = JSON.stringify(report.toJSON(), null, 2);
      const text = report.toText();
      fs.writeFileSync(REPORT_JSON, json);
      fs.writeFileSync(REPORT_TXT, text);

      // eslint-disable-next-line no-console
      console.log(`\n${text}\n`);
      // eslint-disable-next-line no-console
      console.log(`Quick Log smoke report: ${path.relative(process.cwd(), REPORT_JSON)}`);

      const fail = report.firstFailure();
      if (fail) {
        // eslint-disable-next-line no-console
        console.log(
          `FAILED step ${fail.step}: ${fail.label}\n  evidence: ${fail.evidence}\n  report: ${path.relative(process.cwd(), REPORT_JSON)}`,
        );
      }

      try {
        fs.mkdirSync(testInfo.outputDir, { recursive: true });
        const mirrored = path.join(testInfo.outputDir, "quicklog-smoke-report.json");
        fs.writeFileSync(mirrored, json);
        await testInfo.attach("quicklog-smoke-report", {
          path: mirrored,
          contentType: "application/json",
        });
      } catch {
        // best-effort attach; stable file is already on disk
      }
    }
  });
});
