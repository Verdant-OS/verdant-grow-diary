import { test, expect } from "./lib/authedTest";
import fs from "node:fs";
import path from "node:path";
import type { Locator, Request } from "@playwright/test";
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
 *   E2E_GROW_1_SECOND_PLANT_NAME Display name of a second plant in the same
 *                                grow/tent (default "E2E Test Plant 2")
 *
 * SAFETY:
 *   - No auth bypass. No hardcoded credentials. No elevated DB role.
 *   - Reads/writes only what an authenticated user could do via the UI.
 *   - Does not attach stale/non-usable snapshots.
 */
const PLANT_URL = process.env.E2E_GROW_1_PLANT_URL;
// `??` alone is not enough: an unset GitHub Actions var referenced via
// `env:` arrives as an EMPTY STRING (not undefined), which would produce an
// empty regex that strict-mode-matches every option in the plant select.
const TARGET_NAME = process.env.E2E_GROW_1_SECOND_PLANT_NAME?.trim() || "E2E Test Plant 2";

const RESULTS_DIR = path.resolve(process.cwd(), "e2e/results");
const REPORT_JSON = path.join(RESULTS_DIR, "quicklog-smoke-report.json");
const REPORT_TXT = path.join(RESULTS_DIR, "quicklog-smoke-report.txt");
const SAFE_TARGET_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

interface QuickLogTargetTuple {
  plantId: string;
  tentId: string;
  growId: string;
}

function isSafeTargetId(value: unknown): value is string {
  return typeof value === "string" && SAFE_TARGET_ID_PATTERN.test(value);
}

function readPlantRouteId(plantUrl: string): string {
  const baseUrl = process.env.E2E_BASE_URL?.trim() || "http://localhost:5173";
  const pathname = new URL(plantUrl, baseUrl).pathname;
  const segments = pathname.split("/").filter(Boolean);
  const plantsIndex = segments.lastIndexOf("plants");
  const candidate = plantsIndex >= 0 ? segments[plantsIndex + 1] : null;
  if (!isSafeTargetId(candidate)) {
    throw new Error("Plant URL does not contain a safe plant route target.");
  }
  return candidate;
}

function readObservedQuickLogTargetId(request: Request): string | null {
  try {
    const body = request.postDataJSON() as { p_target_id?: unknown } | null;
    if (!body) return null;
    const candidate = body.p_target_id;
    return isSafeTargetId(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

async function readTargetTuple(dialog: Locator): Promise<QuickLogTargetTuple> {
  const card = dialog.getByTestId("quick-log-target-card");
  const [plantId, tentId, growId] = await Promise.all([
    card.getAttribute("data-target-plant-id"),
    card.getAttribute("data-target-tent-id"),
    card.getAttribute("data-target-grow-id"),
  ]);
  if (![plantId, tentId, growId].every(isSafeTargetId)) {
    throw new Error("Quick Log target card did not expose a safe complete target tuple.");
  }
  return { plantId: plantId!, tentId: tentId!, growId: growId! };
}

/**
 * Open the Quick Log dialog from any Quick Log button.
 *
 * The Quick Log buttons (including the global fast-add button in AppShell)
 * open a type-picker menu first ("Choose what you want to log."). Pick
 * "Note" — the least side-effectful type — to reach the actual dialog.
 * Entry points that open the dialog directly are still supported (the menu
 * is simply absent). Used for both the initial open and every reopen.
 */
async function openQuickLogDialog(page: import("@playwright/test").Page) {
  // The app has THREE Quick Log surfaces; only one is the FULL dialog this
  // checklist exercises (src/components/QuickLog.tsx, mounted in AppShell):
  //  - plant-detail-quick-action-quicklog dispatches the prefill event that
  //    opens the FULL dialog  <-- what we want
  //  - the AppShell header's global fast-add opens a compact summary dialog
  //    with no form body
  //  - the One-Tent Loop card's CTA opens a simplified Target/Action/Photo
  //    dialog with no quick-log-plant-select
  // Prefer the precise testid; fall back to name matching for other pages.
  const preciseButton = page.getByTestId("plant-detail-quick-action-quicklog");
  const anyButton = page.getByRole("button", { name: /quick log|log entry|\+ log/i }).first();
  const havePrecise = await preciseButton
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  await (havePrecise ? preciseButton : anyButton).click();
  const noteMenuItem = page
    .getByRole("menuitem", { name: /^note$/i })
    .or(page.getByRole("option", { name: /^note$/i }))
    .first();
  const menuAppeared = await noteMenuItem
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (menuAppeared) {
    await noteMenuItem.click();
  }
  await expect(page.getByRole("dialog")).toBeVisible();
}

/**
 * The live deployment opens the agreement re-consent gate
 * (src/components/AgreementReconsentGate.tsx) whenever the signed-in account
 * has no recorded acceptance for the CURRENT agreement version — the modal
 * intentionally blocks every pointer interaction until accepted. The E2E
 * fixture account hits this after each agreement-version bump, which stalled
 * this checklist at the first click for a full test-timeout. Accept it for
 * the disposable fixture account (a real, persisted acceptance — the same
 * click-through a returning grower performs) and continue. No-op when the
 * gate is not shown.
 */
async function acceptReconsentGateIfShown(page: import("@playwright/test").Page) {
  const gate = page.getByTestId("agreement-reconsent-gate");
  const shown = await gate
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return;
  await gate.locator("#reconsent-accept").click();
  await gate.getByRole("button", { name: /accept and continue/i }).click();
  await gate.waitFor({ state: "hidden", timeout: 15_000 });
}

test.describe("Quick Log smoke checklist", () => {
  test.skip(!PLANT_URL, "Set E2E_GROW_1_PLANT_URL to a Grow #1 plant page to run this smoke test.");

  test("authenticated end-to-end checklist", async ({ page }, testInfo) => {
    const report = new SmokeChecklistReporter();
    let observedRpcTargetId: string | null = null;

    page.on("request", (request) => {
      let pathname: string;
      try {
        pathname = new URL(request.url()).pathname;
      } catch {
        return;
      }
      if (!pathname.endsWith("/rpc/quicklog_save_manual")) return;
      const candidate = readObservedQuickLogTargetId(request);
      if (candidate) observedRpcTargetId = candidate;
    });

    try {
      await page.goto(PLANT_URL!);
      let routePlantId = "";
      await report.run(1, "Validate initial plant route target", async () => {
        routePlantId = readPlantRouteId(PLANT_URL!);
        return "plant route target validated";
      });

      await acceptReconsentGateIfShown(page);

      await openQuickLogDialog(page);
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      let initialTarget: QuickLogTargetTuple | null = null;
      await report.run(2, "Resolve exact Quick Log target card", async () => {
        await expect
          .poll(async () => {
            try {
              return (await readTargetTuple(dialog)).plantId;
            } catch {
              return null;
            }
          })
          .toBe(routePlantId);
        initialTarget = await readTargetTuple(dialog);
        if (initialTarget.plantId !== routePlantId) {
          throw new Error("Quick Log target does not match the Plant Detail route.");
        }
        return "exact route grow/tent/plant target resolved";
      });

      await report.run(3, "Change the selected target tuple", async () => {
        const plantSelect = dialog.getByTestId("quick-log-plant-select");
        await plantSelect.click();
        await page.getByRole("option", { name: new RegExp(TARGET_NAME, "i") }).click();
        await expect
          .poll(() =>
            dialog.getByTestId("quick-log-target-card").getAttribute("data-target-plant-id"),
          )
          .not.toBe(routePlantId);
        const selectedTarget = await readTargetTuple(dialog);
        if (initialTarget && selectedTarget.growId !== initialTarget.growId) {
          throw new Error("Selected target plant is not in the routed plant's grow.");
        }
        if (
          initialTarget &&
          selectedTarget.plantId === initialTarget.plantId &&
          selectedTarget.tentId === initialTarget.tentId &&
          selectedTarget.growId === initialTarget.growId
        ) {
          throw new Error("Quick Log target tuple did not change after plant selection.");
        }
        return "selected grow/tent/plant target changed";
      });

      await report.run(4, "Mismatch banner appears", async () => {
        await expect(dialog.getByTestId("quick-log-plant-mismatch-banner")).toBeVisible();
        return "banner visible";
      });

      await report.run(5, "Review Quick Log issues region appears", async () => {
        await expect(dialog.getByTestId("quick-log-review-issues")).toBeVisible();
        return "review region visible";
      });

      await report.run(6, "Tab reaches issue links", async () => {
        const focusedTestId = () =>
          page.evaluate(
            () => (document.activeElement as HTMLElement | null)?.dataset?.testid ?? "",
          );
        // The "Review before saving" region renders ABOVE the target card,
        // so from the plant select the nearest keyboard path to the jump
        // links is backwards (Shift+Tab). Walk backwards first, then fall
        // back to a forward walk large enough to wrap the dialog's focus
        // trap, so this step survives future reordering of the dialog.
        await dialog.getByTestId("quick-log-plant-select").focus();
        for (let i = 0; i < 12; i++) {
          await page.keyboard.press("Shift+Tab");
          const id = await focusedTestId();
          if (id.startsWith("quick-log-review-jump-")) return `focused ${id} (Shift+Tab x${i + 1})`;
        }
        await dialog.getByTestId("quick-log-plant-select").focus();
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press("Tab");
          const id = await focusedTestId();
          if (id.startsWith("quick-log-review-jump-")) return `focused ${id} (Tab x${i + 1})`;
        }
        throw new Error("Did not reach review jump link via Tab or Shift+Tab");
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

      let snapshotJumpActivated = false;
      await report.run(10, "Activate stale-snapshot jump link", async () => {
        const link = dialog.getByTestId("quick-log-review-jump-snapshot");
        if ((await link.count()) === 0) return "no snapshot jump link (acceptable)";
        await link.click();
        snapshotJumpActivated = true;
        return "activated";
      });

      await report.run(11, "Focus moves to attach snapshot section", async () => {
        // Only meaningful when step 10 actually activated the snapshot jump.
        // Fixtures without a stale snapshot render no jump link, so focus is
        // never moved here — asserting it would fail spuriously.
        if (!snapshotJumpActivated) return "no snapshot jump to activate (acceptable)";
        const section = dialog.getByTestId("quick-log-snapshot-attach-section");
        if ((await section.count()) === 0) return "no attach section (acceptable)";
        await expect(section).toBeFocused();
        return "attach section focused";
      });

      await report.run(12, "Select Watering event type", async () => {
        // The activity-type chips are presentational; `eventType` (which
        // drives the required-watering-ml validation) is owned by the Event
        // select (EventTypeSelector, id=quick-log-event-type). Clicking only
        // the chip leaves eventType on the default, so the blank-ml save
        // would bounce off the note gate instead of the watering gate.
        const eventSelect = dialog.locator("#quick-log-event-type");
        await eventSelect.click();
        await page.getByRole("option", { name: /^watering$/i }).click();
        await expect(eventSelect).toContainText(/watering/i);
        return "watering selected";
      });

      // Watering save validation is driven ADAPTIVELY so this checklist
      // matches the live deployed app today and the branch contract once it
      // ships. The live app requires a note before saving a watering entry
      // (it surfaces "Add a quick note"); the branch adds an undeployed
      // required Watering (ml) field on top. We attempt a blank save, confirm
      // it is BLOCKED, then satisfy whatever the running build requires.
      await report.run(13, "Blank watering save is blocked by validation", async () => {
        await dialog.getByTestId("quick-log-save").click();
        // A validation error must keep the dialog in edit mode — no post-save.
        await expect(dialog.getByTestId("quick-log-post-save")).toHaveCount(0);
        // Some visible error must explain the block (note-required on live,
        // or the watering-ml error on the deployed-branch build).
        const wateringErr = dialog.getByTestId("quicklog-watering-error");
        const saveErr = dialog.getByTestId("quick-log-save-error");
        const shown =
          (await wateringErr.count()) > 0
            ? await wateringErr.isVisible()
            : (await saveErr.count()) > 0 && (await saveErr.isVisible());
        if (shown) return "blocked with a visible validation error";
        // Real browsers can block the submit BEFORE the app handler runs:
        // the native `required` constraint shows a "Please fill out this
        // field" bubble that lives outside the DOM, so neither app error
        // element renders (CI screenshot evidence on #193). Accept that
        // mechanism via ValidityState.
        for (const testId of ["quicklog-watering-ml", "quicklog-note"]) {
          const field = dialog.getByTestId(testId);
          if ((await field.count()) === 0) continue;
          const valueMissing = await field.evaluate(
            (el) => (el as HTMLInputElement | HTMLTextAreaElement).validity?.valueMissing ?? false,
          );
          if (valueMissing) return `blocked by native required validation (${testId})`;
        }
        throw new Error("Blank save produced no visible validation error");
      });

      await report.run(14, "Satisfy required fields (note; watering ml when present)", async () => {
        await dialog.getByTestId("quicklog-note").fill("Smoke watering log");
        // The Watering (ml) field lives inside the collapsed "Add more
        // details" section on builds that enforce it. Expand and fill when
        // present; skip cleanly on the live build that needs only a note.
        let ml = dialog.getByTestId("quicklog-watering-ml");
        if ((await ml.count()) === 0) {
          const moreToggle = dialog.getByRole("switch", { name: /add more details/i });
          if ((await moreToggle.count()) > 0) await moreToggle.click();
          ml = dialog.getByTestId("quicklog-watering-ml");
        }
        if ((await ml.count()) > 0) {
          await ml.fill("250");
          return "note + watering ml (250) filled";
        }
        return "note filled (no watering ml field on this build)";
      });

      await report.run(15, "Save uses displayed target", async () => {
        const displayedTargetId = await dialog
          .getByTestId("quick-log-target-card")
          .getAttribute("data-target-plant-id");
        if (!isSafeTargetId(displayedTargetId)) {
          throw new Error("Displayed Quick Log target is missing or invalid before Save.");
        }
        observedRpcTargetId = null;
        await dialog.getByTestId("quick-log-save").click();
        await expect.poll(() => observedRpcTargetId).toBe(displayedTargetId);
        await expect(dialog.getByTestId("quick-log-post-save")).toBeVisible({
          timeout: 15_000,
        });
        return "post-save shown and RPC target matched displayed target";
      });

      await report.run(16, "Post-save actions visible (View / Log another / Close)", async () => {
        await expect(dialog.getByTestId("quick-log-view-target-plant")).toBeVisible();
        await expect(dialog.getByTestId("quick-log-post-save-another")).toBeVisible();
        await expect(dialog.getByTestId("quick-log-post-save-close")).toBeVisible();
        return "all three actions visible";
      });

      await report.run(17, "Tab reaches Log another", async () => {
        await dialog.getByTestId("quick-log-view-target-plant").focus();
        await page.keyboard.press("Tab");
        await expect(dialog.getByTestId("quick-log-post-save-another")).toBeFocused();
        return "focused";
      });

      await report.run(18, "Activate Log another", async () => {
        await dialog.getByTestId("quick-log-post-save-another").click();
        return "activated";
      });

      await report.run(19, "Same target plant remains selected", async () => {
        await expect(dialog.getByTestId("quick-log-post-save")).toHaveCount(0);
        await expect(dialog.getByTestId("quick-log-plant-select")).toContainText(
          new RegExp(TARGET_NAME, "i"),
        );
        return "kept selected plant";
      });

      await report.run(20, "Form resets, focus lands in note field", async () => {
        await expect(dialog.getByTestId("quicklog-note")).toBeFocused();
        await expect(dialog.getByTestId("quicklog-note")).toHaveValue("");
        return "note focused, empty";
      });

      await report.run(21, "Save quick Observation", async () => {
        await dialog.getByTestId("quicklog-note").fill("Smoke checklist observation");
        await dialog.getByTestId("quick-log-save").click();
        await expect(dialog.getByTestId("quick-log-post-save")).toBeVisible({
          timeout: 15_000,
        });
        return "second save succeeded";
      });

      await report.run(22, "Close and reopen Quick Log", async () => {
        await dialog.getByTestId("quick-log-post-save-close").click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        // Reopening hits the same type-picker menu as the initial open —
        // reuse the shared helper (Codex review on #193).
        await openQuickLogDialog(page);
        return "reopened";
      });

      await report.run(23, "No stale post-save state on reopen", async () => {
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

      console.log(`\n${text}\n`);

      console.log(`Quick Log smoke report: ${path.relative(process.cwd(), REPORT_JSON)}`);

      const fail = report.firstFailure();
      if (fail) {
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
