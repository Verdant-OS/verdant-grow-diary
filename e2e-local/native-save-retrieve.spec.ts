import { test, expect, type Page, type Response } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  acceptedReceipt, createLocalFixture, fenceBrowser, fingerprint, isRow,
  ownerRows, signIn, visibleEventIds, visiblePlantIds, witnessRows,
  type LocalFixture, type OwnerRows, type Row, type Scope,
} from "./lib/nativeLocalFixtures";

// Deliberately outside ./e2e: invoke only with playwright.native-local.config.ts.
// No auth bypass, mocked persistence, provider call, or published-build claim.

function plantUrl(f: LocalFixture, scope: Scope): string {
  return f.env.ui + "/plants/" + scope.plantId + "?tentId=" + scope.tentId;
}

async function openNote(page: Page): Promise<void> {
  await page.getByTestId("header-quick-log-trigger").click();
  await expect(page.locator("#qlv2-note")).toBeVisible();
}

async function selectTarget(page: Page, scope: Scope, type: "plant" | "tent"): Promise<void> {
  const label = type === "plant" ? "Plant · " + scope.plantName : "Tent · " + scope.tentName;
  await page.locator("#qlv2-target").click();
  await page.getByTestId("qlv2-target-content").getByRole("option", { name: label, exact: true }).click();
  await expect(page.locator("#qlv2-target")).toContainText(label);
}

function isManualResponse(response: Response, f: LocalFixture): boolean {
  const url = new URL(response.url());
  return url.origin === f.env.api &&
    url.pathname === "/rest/v1/rpc/quicklog_save_manual" &&
    response.request().method() === "POST";
}

async function saveNote(page: Page, f: LocalFixture) {
  const responsePromise = page.waitForResponse((response) => isManualResponse(response, f));
  await page.getByTestId("qlv2-save").click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const receipt = acceptedReceipt(await response.json());
  const payload: unknown = response.request().postDataJSON();
  if (!isRow(payload)) throw new Error("The real Note request was not an object.");
  await expect(page.getByTestId("qlv2-post-save")).toBeVisible();
  return { receipt, payload };
}

function assertCanonicalNote(
  rows: OwnerRows, f: LocalFixture, scope: Scope, type: "plant" | "tent",
  id: string, payload: Row,
): void {
  const notes = rows.grow_events.filter((row) => row.id === id);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({
    user_id: f.owner.id, grow_id: scope.growId, tent_id: scope.tentId,
    plant_id: type === "plant" ? scope.plantId : null,
    event_type: "observation", source: "manual", note: payload.p_note,
  });
  expect(payload.p_target_type).toBe(type);
  expect(payload.p_target_id).toBe(type === "plant" ? scope.plantId : scope.tentId);
  expect(payload.p_action).toBe("note");
  expect(typeof payload.p_idempotency_key).toBe("string");
  expect(String(payload.p_idempotency_key).length).toBeGreaterThan(0);
  const diary = rows.diary_entries.filter((row) => {
    const details = isRow(row.details) ? row.details : {};
    return details.linked_grow_event_id === id || details.grow_event_id === id;
  });
  expect(diary).toHaveLength(1);
  expect(diary[0]).toMatchObject({
    user_id: f.owner.id, grow_id: scope.growId, tent_id: scope.tentId,
    plant_id: type === "plant" ? scope.plantId : null, note: payload.p_note,
  });
  expect(Date.parse(String(notes[0].occurred_at))).toBe(Date.parse(String(payload.p_occurred_at)));
  expect(Date.parse(String(diary[0].entry_at))).toBe(Date.parse(String(payload.p_occurred_at)));
  expect(Number.isFinite(Date.parse(String(notes[0].logged_at)))).toBe(true);
  expect(Date.parse(String(diary[0].logged_at))).toBe(Date.parse(String(notes[0].logged_at)));
}

async function viewSavedTimeline(page: Page, scope: Scope, type: "plant" | "tent", id: string, note: string) {
  await page.getByTestId("quick-log-post-save-view").click();
  await expect(page).toHaveURL((url) =>
    url.pathname === "/timeline" &&
    url.searchParams.get("growId") === scope.growId &&
    url.searchParams.get("tentId") === scope.tentId &&
    url.searchParams.get("plantId") === (type === "plant" ? scope.plantId : null) &&
    url.hash === "#timeline-entry-" + id,
  );
  // The actual merged Timeline card, scoped by persisted event identity.
  const anchor = page.locator('[id="timeline-entry-' + id + '"]');
  // A merged diary row exposes the grow-event ID as a hidden alias inside its li.
  const card = anchor.locator("xpath=ancestor-or-self::li[1]");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(note);
}

async function pendingNote(page: Page, ownerId: string): Promise<Row | null> {
  // Read exactly this pending Note; never enumerate auth/session storage.
  const raw = await page.evaluate((key) => sessionStorage.getItem(key),
    "verdant:quick-log:pending-note:v1:" + ownerId);
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!isRow(parsed)) throw new Error("Pending Note envelope is malformed.");
  return parsed;
}

test("real browser saves plant and tent Notes, reopens, and retrieves the scoped Timeline cards", async ({ page, context }) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    const otherBefore = fingerprint(await witnessRows(f));
    await signIn(page, f);
    const ids: string[] = [];
    for (const [type, scope] of [["plant", f.primary], ["tent", f.secondary]] as const) {
      await page.goto(plantUrl(f, scope));
      await openNote(page);
      await selectTarget(page, scope, type);
      const note = "Native browser " + type + " note " + randomUUID();
      await page.locator("#qlv2-note").fill(note);
      const { receipt, payload } = await saveNote(page, f);
      ids.push(receipt.grow_event_id);
      assertCanonicalNote(await ownerRows(f.owner), f, scope, type, receipt.grow_event_id, payload);
      expect(await pendingNote(page, f.owner.id)).toBeNull();
      await viewSavedTimeline(page, scope, type, receipt.grow_event_id, note);
      await openNote(page);
      await expect(page.locator("#qlv2-note")).toHaveValue("");
      // True page navigation remounts the sheet before the next target.
      await page.goto(plantUrl(f, scope));
    }
    const rows = await ownerRows(f.owner);
    expect(rows.grow_events).toHaveLength(2);
    expect(rows.diary_entries).toHaveLength(2);
    expect(rows.environment_events).toHaveLength(0);
    expect(await visibleEventIds(f.other, ids)).toEqual([]);
    expect(await visiblePlantIds(f.owner, [f.foreign.plantId])).toEqual([]);
    expect(await visiblePlantIds(f.other, [f.primary.plantId, f.secondary.plantId])).toEqual([]);
    expect(await visibleEventIds(f.owner, [f.witnessId])).toEqual([]);
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);
  } finally {
    await page.close();
    await f.cleanup();
  }
});

test("an actually accepted Note survives lost reply and same-tab reload, then retries once with its frozen payload", async ({ page, context }) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    await signIn(page, f);
    await page.goto(plantUrl(f, f.primary));
    await openNote(page);
    await selectTarget(page, f.primary, "plant");
    const note = "Native lost reply with manual snapshot " + randomUUID();
    await page.locator("#qlv2-note").fill(note);
    await page.locator("summary").filter({ hasText: "Manual sensor snapshot (optional)" }).click();
    const temperatureLabel = await page.locator('label[for="qlv2-temp"]').innerText();
    await page.locator("#qlv2-temp").fill(temperatureLabel.includes("°F") ? "77" : "25");
    await page.locator("#qlv2-rh").fill("58");
    await page.locator("#qlv2-vpd").fill("1.2");
    const otherBefore = fingerprint(await witnessRows(f));
    const requests: Row[] = [];
    const receipts: Array<Row & { grow_event_id: string }> = [];
    let dropped = 0;
    await context.route(f.env.api + "/rest/v1/rpc/quicklog_save_manual", async (route) => {
      const request = route.request();
      if (request.method() !== "POST") return route.fallback();
      if (new URL(request.url()).origin !== f.env.api) throw new Error("Non-local Note RPC blocked.");
      const payload: unknown = request.postDataJSON();
      if (!isRow(payload)) throw new Error("The real Note request was not an object.");
      requests.push(payload);
      // Fetch the real authenticated local request. No response body is fabricated.
      const response = await route.fetch({ maxRedirects: 0 });
      if (new URL(response.url()).origin !== f.env.api || !response.ok()) {
        await route.fulfill({ response });
        return;
      }
      const receipt = acceptedReceipt(await response.json());
      receipts.push(receipt);
      if (dropped === 0 && payload.p_note === note && payload.p_action === "note") {
        dropped += 1;
        await route.abort("failed"); // Only after confirmed server acceptance.
      } else {
        await route.fulfill({ response });
      }
    });
    await page.getByTestId("qlv2-save").click();
    await expect(page.getByTestId("qlv2-exact-retry-lock")).toBeVisible();
    await expect(page.getByTestId("qlv2-save-retry")).toBeEnabled();
    await expect(page.getByTestId("qlv2-error")).toBeVisible();
    await expect(page.getByTestId("qlv2-post-save")).toHaveCount(0);
    expect(dropped).toBe(1);
    expect(requests).toHaveLength(1);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].reused).toBe(false);
    const original = requests[0];
    expect(original.p_temperature_c).toBe(25);
    expect(original.p_humidity_pct).toBe(58);
    expect(original.p_vpd_kpa).toBe(1.2);
    const stored = await pendingNote(page, f.owner.id);
    expect(stored).toMatchObject({ version: 1, ownerId: f.owner.id, payload: original });
    const committed = await ownerRows(f.owner);
    assertCanonicalNote(committed, f, f.primary, "plant", receipts[0].grow_event_id, original);
    expect(committed.grow_events).toHaveLength(2);
    expect(committed.diary_entries).toHaveLength(1);
    expect(committed.environment_events).toHaveLength(1);
    expect(committed.environment_events[0]).toMatchObject({
      event_id: receipts[0].environment_event_id, user_id: f.owner.id,
      temperature_c: 25, humidity_pct: 58, vpd_kpa: 1.2,
    });
    const environment = committed.grow_events.find((row) => row.id === receipts[0].environment_event_id);
    expect(environment).toMatchObject({
      event_type: "environment", source: "manual", grow_id: f.primary.growId,
      tent_id: f.primary.tentId, plant_id: f.primary.plantId,
    });
    await page.reload();
    // Reopen on a DIFFERENT target after true remount; recovery must retain original.
    await page.goto(plantUrl(f, f.secondary));
    await openNote(page);
    await expect(page.getByTestId("qlv2-exact-retry-lock")).toBeVisible();
    await expect(page.getByTestId("qlv2-save-retry")).toBeEnabled();
    await expect(page.locator("#qlv2-note")).toBeDisabled();
    await expect(page.locator("#qlv2-note")).toHaveValue(note);
    await expect(page.locator("#qlv2-target")).toBeDisabled();
    await expect(page.locator("#qlv2-target")).toContainText(f.primary.plantName);
    await expect(page.getByTestId("qlv2-post-save")).toHaveCount(0);
    expect(await pendingNote(page, f.owner.id)).toEqual(stored);
    // Observable settled recovery UI plus real readback; no arbitrary sleep.
    expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(committed));
    expect(requests).toHaveLength(1);
    await page.getByTestId("qlv2-save-retry").click();
    await expect(page.getByTestId("qlv2-persisted-note")).toContainText(note);
    await expect(page.getByTestId("qlv2-post-save")).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(original);
    expect(receipts).toHaveLength(2);
    expect(receipts[1].reused).toBe(true);
    expect(receipts[1].grow_event_id).toBe(receipts[0].grow_event_id);
    expect(await pendingNote(page, f.owner.id)).toBeNull();
    expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(committed));
    expect(await visibleEventIds(f.other, committed.grow_events.map((row) => String(row.id)))).toEqual([]);
    expect(await visibleEventIds(f.owner, [f.witnessId])).toEqual([]);
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);
    await viewSavedTimeline(page, f.primary, "plant", receipts[0].grow_event_id, note);
  } finally {
    await page.close();
    await f.cleanup();
  }
});

test("real dated rows retain manual provenance beyond the dense live cap and stale-only evidence stays cautionary", async ({ page, context }) => {
  const f = await createLocalFixture(true);
  try {
    await fenceBrowser(context, f.env);
    const rows = await ownerRows(f.owner);
    const primaryRows = rows.sensor_readings.filter((row) => row.tent_id === f.primary.tentId);
    expect(primaryRows.filter((row) => row.source === "live")).toHaveLength(55);
    const manuals = primaryRows.filter((row) => row.source === "manual");
    expect(manuals).toHaveLength(1);
    expect(Date.parse(String(manuals[0].captured_at))).toBe(Date.parse(f.manualAt));
    expect(Number(manuals[0].value)).toBe(25);
    const newestLive = primaryRows.filter((row) => row.source === "live")
      .sort((a, b) => Date.parse(String(b.captured_at)) - Date.parse(String(a.captured_at)))[0];
    expect(Date.parse(String(newestLive.captured_at))).toBe(Date.parse(f.staleAt));
    expect(Date.parse(f.staleAt)).toBeGreaterThan(Date.parse(f.manualAt));
    expect(rows.sensor_readings.some((row) => row.tent_id === f.foreign.tentId)).toBe(false);
    const otherRows = await witnessRows(f);
    expect(otherRows.sensor_readings).toHaveLength(1);
    expect(otherRows.sensor_readings[0].tent_id).toBe(f.foreign.tentId);
    await signIn(page, f);
    await page.goto(f.env.ui + "/tents/" + f.primary.tentId);
    await expect(page.getByTestId("tent-detail-sensor-source")).toHaveText("Live sensor");
    await expect(page.getByTestId("tent-detail-sensor-stale")).toBeVisible();
    await expect(page.getByTestId("tent-detail-sensor-snapshot-truth")).toHaveAttribute("data-is-stale", "true");
    const history = page.getByTestId("tent-manual-snapshot-history");
    await expect(history.getByTestId("tent-manual-snapshot-history-source")).toHaveText("Manual");
    await expect(history.getByTestId("tent-manual-snapshot-history-metric")).toHaveText(/^Temp\s*77\.0\s*°F$/);
    for (const [scope, manual] of [[f.primary, true], [f.secondary, false]] as const) {
      await page.goto(plantUrl(f, scope));
      await page.getByTestId("plant-detail-disclosure-ai-trigger").click();
      const panel = page.getByTestId("plant-detail-ai-doctor-sensor-evidence-panel");
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute("data-status", manual ? "usable" : "stale");
      await expect(panel).toHaveAttribute("data-reason", manual ? "fresh_accepted" : "outside_stale_window");
      await expect(panel).toHaveAttribute("data-mode", manual ? "healthy" : "cautionary");
      await expect(panel).toHaveAttribute("data-counts-as-healthy", manual ? "true" : "false");
      await expect(page.getByTestId("plant-detail-ai-doctor-sensor-evidence-explanation"))
        .toHaveText(manual
          ? "Latest manual snapshot accepted."
          : "Sensor snapshot is outside the stale window — cautionary context only.");
    }
    expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(rows));
    expect(fingerprint(await witnessRows(f))).toBe(fingerprint(otherRows));
  } finally {
    await page.close();
    await f.cleanup();
  }
});
