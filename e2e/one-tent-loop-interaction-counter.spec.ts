// One-Tent Loop interaction-counter baseline — Tranche B+ PR-B0a.
//
// Measures the tired-grower journeys as DETERMINISTIC FIXTURE VARIANTS with
// exact counts, so docs/one-tent-loop-efficiency-baseline.md gains runtime
// before-values that later slices must beat with the same method. Ranged
// baseline rows are split into named variants here; the numbers asserted
// below are the authoritative "before" values.
//
// SAFETY:
// - chromium-mocked only; every Supabase auth/REST request is intercepted.
// - No real account, no real row, no elevated role, no fabricated login.
// - Edge functions are stubbed and model hosts aborted, and each scenario
//   asserts paid_ai_requests === 0.
// - The only write seam is the stubbed quicklog_save_manual RPC; scenarios
//   assert the exact RPC count so a second persistence path would fail here.
import { expect, test, type Page } from "@playwright/test";

import { createCountedDriver } from "./helpers/countedDriver";
import {
  createInteractionCounter,
  serializeInteractionCountReceipt,
} from "./helpers/interactionCounter";
import {
  FAKE_PLANT_ID,
  MOCKED_PROJECT,
  createMockedWorld,
  mockSignedInSupabase,
  seedFakeSession,
} from "./helpers/mockedOneTentWorld";
import { denyAnalyticsConsent } from "./utils/analyticsConsent";

/**
 * Wait for a surface to finish rendering before the measured journey starts.
 * Generous by design: the dev server compiles a route on first visit, and a
 * compile stall is an environment fact, never a grower interaction.
 */
const READY_TIMEOUT_MS = 90_000;
async function waitForReady(locator: ReturnType<Page["getByTestId"]>): Promise<void> {
  await locator.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
}

test.describe("One-Tent Loop interaction counter baseline", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `interaction measurement runs once, under the ${MOCKED_PROJECT} project`,
    );
  });

  test("S1a: plant page status-only save costs 3 interactions and 0 typing", async ({ page }) => {
    const counter = createInteractionCounter("s1a-plant-status-save");
    const driver = createCountedDriver(page, counter);
    const world = createMockedWorld();

    // The consent banner is a fixed overlay that would sit over the save
    // control; denying keeps the no-analytics default AND clears the overlay,
    // so the measured journey is the grower's, not the banner's.
    await denyAnalyticsConsent(page);
    await seedFakeSession(page);
    await mockSignedInSupabase(page, world, counter);

    await driver.gotoCounted(`/plants/${FAKE_PLANT_ID}`);
    // Cold-compile tolerance, not a measurement: the first spec in a run pays
    // the dev server's route compile, which can exceed the action timeout.
    // Waiting for readiness with an explicit budget keeps the measured
    // journey honest — counting is driver-level, so this cannot shift counts.
    await waitForReady(page.getByTestId("plant-detail-quick-log-open"));

    // The measured journey: open Quick Log → tap a status chip → save.
    await driver.click(page.getByTestId("plant-detail-quick-log-open"));
    await expect(page.getByTestId("plant-quick-log-sheet")).toBeVisible();
    await driver.click(page.getByTestId("plant-response-check-better"));
    await driver.click(page.getByTestId("plant-quick-log-save"));

    await expect
      .poll(() => counter.snapshot().supabase_writes.rpc["quicklog_save_manual"] ?? 0)
      .toBe(1);

    const receipt = counter.snapshot();

    console.log(serializeInteractionCountReceipt(receipt));

    // Exact baseline values (S1a). The route transition is the navigation
    // that puts the grower on the plant page; the 3 taps are the journey.
    expect(receipt.clicks).toBe(3);
    expect(receipt.fills).toBe(0);
    expect(receipt.keypresses).toBe(0);
    expect(receipt.target_reselections).toBe(0);
    expect(receipt.route_transitions).toBe(1);
    // Exactly one save, through the canonical contract. `has_role` is the
    // app's read-only role probe (PostgREST addresses RPCs over POST), so it
    // is tallied by name and is not a write.
    expect(receipt.supabase_writes.rpc["quicklog_save_manual"]).toBe(1);
    // Zero direct table writes: a second persistence path would show here.
    expect(receipt.supabase_writes.rest_post).toBe(0);
    expect(receipt.supabase_writes.rest_patch).toBe(0);
    expect(receipt.supabase_writes.rest_delete).toBe(0);
    expect(receipt.paid_ai_requests).toBe(0);
  });

  test("S7: post-save timeline evidence costs at most one continuation action", async ({
    page,
  }) => {
    const counter = createInteractionCounter("s7-save-to-timeline");
    const driver = createCountedDriver(page, counter);
    const world = createMockedWorld();

    await denyAnalyticsConsent(page);
    await seedFakeSession(page);
    await mockSignedInSupabase(page, world, counter);

    await driver.gotoCounted(`/plants/${FAKE_PLANT_ID}`);
    await waitForReady(page.getByTestId("plant-detail-quick-log-open"));
    await driver.click(page.getByTestId("plant-detail-quick-log-open"));
    await driver.click(page.getByTestId("plant-response-check-better"));
    await driver.click(page.getByTestId("plant-quick-log-save"));
    await expect
      .poll(() => counter.snapshot().supabase_writes.rpc["quicklog_save_manual"] ?? 0)
      .toBe(1);

    // Continuation: reach the Timeline where the saved entry is evidence.
    await driver.gotoCounted("/timeline");
    await driver.expectRoute("/timeline");

    const receipt = counter.snapshot();

    console.log(serializeInteractionCountReceipt(receipt));

    expect(receipt.fills).toBe(0);
    // One deliberate continuation beyond the save journey's 3 taps.
    expect(receipt.clicks).toBe(3);
    expect(receipt.supabase_writes.rpc["quicklog_save_manual"]).toBe(1);
    expect(receipt.supabase_writes.rest_post).toBe(0);
    expect(receipt.paid_ai_requests).toBe(0);
    // The saved row is the single piece of timeline evidence.
    expect(world.savedRows).toHaveLength(1);
  });
});
