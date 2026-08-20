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

    // SETUP, not measurement: S1a's journey starts with the grower already
    // on Plant Detail, so arriving there is not one of their interactions.
    // Counting it inflated the authoritative before-value by one transition.
    await page.goto(`/plants/${FAKE_PLANT_ID}`);
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
    // The RPC tally increments inside the route handler, BEFORE route.fulfill()
    // and before the app's post-save continuation runs. Snapshotting on that
    // alone could miss a follow-on persistence or paid-AI request and still
    // call the receipt complete. The sheet closing is the app's own definitive
    // save-success signal, so wait for it first.
    await expect(page.getByTestId("plant-quick-log-sheet")).toBeHidden({ timeout: 15_000 });

    const receipt = counter.snapshot();

    console.log(serializeInteractionCountReceipt(receipt));

    // The COMPLETE receipt, asserted as one object. Field-by-field checks
    // leave the unasserted fields free to drift, and an added write RPC would
    // simply appear beside the expected one while a per-key assertion still
    // passed. Exact equality is what makes this an authoritative before-value.
    // `has_role` is the app's read-only role probe — PostgREST addresses RPCs
    // over POST, so it is tallied by name and is not a write.
    expect(receipt).toEqual({
      schema_version: "1",
      scenario: "s1a-plant-status-save",
      status: "measured",
      clicks: 3,
      fills: 0,
      keypresses: 0,
      target_reselections: 0,
      route_transitions: 0,
      supabase_writes: {
        rest_post: 0,
        rest_patch: 0,
        rest_delete: 0,
        rpc: { has_role: 1, quicklog_save_manual: 1 },
      },
      paid_ai_requests: 0,
    });
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

    // SETUP, not measurement (see S1a).
    await page.goto(`/plants/${FAKE_PLANT_ID}`);
    await waitForReady(page.getByTestId("plant-detail-quick-log-open"));
    await driver.click(page.getByTestId("plant-detail-quick-log-open"));
    await driver.click(page.getByTestId("plant-response-check-better"));
    await driver.click(page.getByTestId("plant-quick-log-save"));
    await expect
      .poll(() => counter.snapshot().supabase_writes.rpc["quicklog_save_manual"] ?? 0)
      .toBe(1);
    // Definitive save-success state before continuing (see S1a).
    await expect(page.getByTestId("plant-quick-log-sheet")).toBeHidden({ timeout: 15_000 });

    // Continuation: the grower's REAL affordance — the app's own Timeline
    // navigation. Driving this with page.goto() would measure a scripted URL
    // jump, not a continuation, and would under-count the grower's tap.
    //
    // Measured, not assumed: the contextual "Open Timeline" button in the
    // recent-activity panel (`plant-recent-activity-open-timeline`) is present
    // in the DOM after a save but resolves as NOT VISIBLE on the desktop
    // viewport, so it is not a reachable continuation here. The always-visible
    // sidebar link is what a grower can actually tap. That asymmetry is
    // recorded in the baseline rather than papered over.
    await driver.click(page.getByRole("link", { name: "Timeline", exact: true }).first());
    // Verify only. expectRoute records the transition the click caused; the
    // click itself is the interaction. Pairing gotoCounted with expectRoute
    // for one navigation double-counts it.
    await driver.expectRoute("/timeline");

    // Evidence must actually RENDER, and render EXACTLY ONCE. The mocked
    // world writes the same two rows production does — a grow_events spine
    // plus a linked diary companion — so Timeline's dual-source read and its
    // companion de-duplication are both exercised here. Asserting only that
    // "Better" appears would pass through the diary fallback alone even if the
    // grow-event read or the merge were broken; asserting the COUNT is what
    // proves one canonical save yields one piece of evidence, not two.
    const timelineEvidence = page.getByTestId("timeline-entry").filter({ hasText: "Better" });
    await expect(timelineEvidence).toHaveCount(1, { timeout: 15_000 });

    const receipt = counter.snapshot();

    console.log(serializeInteractionCountReceipt(receipt));

    // The COMPLETE receipt (see S1a). One deliberate continuation click
    // beyond the save journey's 3 taps, and exactly one route transition —
    // the timeline navigation that click caused. Arriving on Plant Detail is
    // setup and is not counted.
    expect(receipt).toEqual({
      schema_version: "1",
      scenario: "s7-save-to-timeline",
      status: "measured",
      clicks: 4,
      fills: 0,
      keypresses: 0,
      target_reselections: 0,
      route_transitions: 1,
      supabase_writes: {
        rest_post: 0,
        rest_patch: 0,
        rest_delete: 0,
        rpc: { has_role: 1, quicklog_save_manual: 1 },
      },
      paid_ai_requests: 0,
    });
    // Prove the dual-source read actually happened. The rendered count alone
    // is source-agnostic: if Timeline stopped issuing or using the grow_events
    // read, the diary companion would still render exactly one "Better" and
    // the count assertion would pass. These counters only increment for reads
    // carrying the correct `grow_id` filter, so they pin the scoping too.
    expect(world.reads.grow_events).toBeGreaterThan(0);
    expect(world.reads.diary_entries).toBeGreaterThan(0);

    // One canonical save == one spine row + one linked diary companion.
    expect(world.savedGrowEvents).toHaveLength(1);
    expect(world.savedRows).toHaveLength(1);
    expect(world.savedRows[0].details).toMatchObject({
      linked_grow_event_id: world.savedGrowEvents[0].id,
    });
  });
});
