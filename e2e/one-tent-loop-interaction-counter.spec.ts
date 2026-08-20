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
  type InteractionCountReceipt,
  type InteractionCounter,
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

/**
 * Snapshot only once the counters have stopped moving.
 *
 * Hiding the Quick Log sheet is NOT a completion fence: PlantQuickLog calls
 * `onOpenChange(false)` before `onSaved?.()`, so a post-save callback could in
 * principle issue work that lands after the sheet is gone and after the
 * receipt was taken — under-counting a write, or worse reporting
 * `paid_ai_requests: 0` while a paid call was in flight.
 *
 * Measured, not assumed: PlantDetail (the mount both scenarios drive) passes
 * no `onSaved` at all today, so there is no callback to settle and no explicit
 * post-callback state to wait for. That is a fact about the current mount, not
 * a property of the harness — adding the prop later would silently reopen the
 * hole. So the fence is on the observable class rather than the one instance:
 * wait for the network to go idle, then require the receipt to be byte-stable
 * across a bounded quiet window before recording it.
 */
async function settledReceipt(
  page: Page,
  counter: InteractionCounter,
): Promise<InteractionCountReceipt> {
  await page.waitForLoadState("networkidle");
  let stable = 0;
  let previous = serializeInteractionCountReceipt(counter.snapshot());
  for (let sample = 0; sample < 20; sample += 1) {
    await page.waitForTimeout(100);
    const current = serializeInteractionCountReceipt(counter.snapshot());
    if (current === previous) {
      stable += 1;
      // Three consecutive quiet samples = 300ms with nothing arriving.
      if (stable >= 3) return counter.snapshot();
    } else {
      stable = 0;
      previous = current;
    }
  }
  throw new Error("interaction counters never settled; a late request is still arriving");
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
    // Setup has landed. From here every real main-frame route change counts,
    // so a save that started auto-navigating could not report zero.
    driver.beginRouteObservation();

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

    const receipt = await settledReceipt(page, counter);

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

    // S1a saves too, so it carries the same two save-shape obligations as S7.
    // Plant Detail's sheet hardcodes `targetType: "plant"`
    // (PlantQuickLog.tsx:343); the shared fixture accepts either fixture
    // target on purpose, since tent-scoped journeys are real and a later slice
    // measures them, so requiring the PLANT target is this scenario's job.
    expect(world.lastTarget).toEqual({ type: "plant", id: FAKE_PLANT_ID });
    // Production skips deduplication entirely when the key is absent, so a
    // dropped key is a silent duplicate-write regression that a successful
    // save receipt alone cannot see.
    expect(typeof world.lastIdempotencyKey).toBe("string");
    expect((world.lastIdempotencyKey ?? "").length).toBeGreaterThanOrEqual(8);
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
    driver.beginRouteObservation();
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
    // Correctness check only — it counts nothing. The transition itself is
    // observed at the main frame, so this receipt's `route_transitions: 1`
    // is a measurement of what the app did, not of this assertion firing.
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

    const receipt = await settledReceipt(page, counter);

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
    //
    // `grow_events` here is the CORE listing read specifically. Timeline's
    // supplemental by-id companion lookup is counted separately, because it
    // also returns the spine row: were both folded into one counter, a
    // Timeline that lost its core query would still satisfy this assertion
    // through the supplemental lookup and measure green while broken.
    expect(world.reads.grow_events).toBeGreaterThan(0);
    expect(world.reads.diary_entries).toBeGreaterThan(0);

    // Both scenarios drive Quick Log from Plant Detail, whose sheet hardcodes
    // `targetType: "plant"` (PlantQuickLog.tsx:343). The shared fixture accepts
    // either fixture target on purpose — tent-scoped journeys are real and a
    // later slice measures them — so requiring the PLANT target is this
    // scenario's job. Without it, a regression that associated the log with the
    // tent would still render one grow-scoped "Better" and measure green.
    expect(world.lastTarget).toEqual({ type: "plant", id: FAKE_PLANT_ID });

    // The save must actually CARRY an idempotency key. Production skips
    // deduplication entirely when the field is absent, so a dropped key is a
    // silent duplicate-write regression that a successful-save receipt alone
    // cannot see.
    expect(typeof world.lastIdempotencyKey).toBe("string");
    expect((world.lastIdempotencyKey ?? "").length).toBeGreaterThanOrEqual(8);

    // One canonical save == one spine row + one linked diary companion.
    expect(world.savedGrowEvents).toHaveLength(1);
    expect(world.savedRows).toHaveLength(1);
    expect(world.savedRows[0].details).toMatchObject({
      linked_grow_event_id: world.savedGrowEvents[0].id,
    });
  });
});
