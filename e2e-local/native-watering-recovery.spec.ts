import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  acceptedReceipt,
  createLocalFixture,
  fenceBrowser,
  fingerprint,
  isRow,
  ownerRows,
  signIn,
  visibleEventIds,
  witnessRows,
  type Account,
  type LocalFixture,
  type OwnerRows,
  type Row,
  type Scope,
} from "./lib/nativeLocalFixtures";

// Real disposable DB only. Intercept the reply AFTER the authenticated RPC
// commits; do not fabricate persistence, authentication, or a successful receipt.
function plantUrl(f: LocalFixture, scope: Scope): string {
  return f.env.ui + "/plants/" + scope.plantId + "?tentId=" + scope.tentId;
}

async function openQuickLog(page: Page): Promise<void> {
  await page.getByTestId("header-quick-log-trigger").click();
  await expect(page.getByRole("dialog", { name: "Quick Log", exact: true })).toBeVisible();
}

async function pendingWater(page: Page, ownerId: string): Promise<Row | null> {
  // Read this operation only; never enumerate auth/session storage.
  const raw = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    "verdant:quick-log:pending-watering:v1:" + ownerId,
  );
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!isRow(value)) throw new Error("Pending Water envelope is malformed.");
  return value;
}

async function wateringRows(account: Account): Promise<Row[]> {
  const { data, error } = await account.client.from("watering_events").select("*");
  if (error || !Array.isArray(data)) throw new Error("Authenticated Water readback failed.");
  if (data.some((row: Row) => row.user_id !== account.id)) {
    throw new Error("Authenticated Water read exposed another owner.");
  }
  return data as Row[];
}

function assertWater(
  rows: OwnerRows,
  water: Row[],
  f: LocalFixture,
  id: string,
  payload: Row,
): void {
  expect(rows.grow_events).toHaveLength(1);
  expect(rows.diary_entries).toHaveLength(1);
  expect(rows.environment_events).toHaveLength(0);
  expect(rows.sensor_readings).toHaveLength(0);
  expect(water).toHaveLength(1);
  expect(rows.grow_events[0]).toMatchObject({
    id,
    user_id: f.owner.id,
    grow_id: f.primary.growId,
    tent_id: f.primary.tentId,
    plant_id: f.primary.plantId,
    event_type: "watering",
    source: "manual",
    note: payload.p_note,
  });
  expect(water[0]).toMatchObject({ event_id: id, user_id: f.owner.id, volume_ml: 750 });
  const diary = rows.diary_entries[0];
  expect(diary).toMatchObject({
    user_id: f.owner.id,
    grow_id: f.primary.growId,
    tent_id: f.primary.tentId,
    plant_id: f.primary.plantId,
    note: payload.p_note,
    details: {
      linked_grow_event_id: id,
      event_type: "watering",
      watering: { volume_ml: 750 },
      sensor_snapshot: {
        source: "manual",
        metrics: { temperature_c: 25, humidity_pct: 55 },
      },
    },
  });
  const details = diary.details;
  if (!isRow(details) || !isRow(details.sensor_snapshot)) {
    throw new Error("Persisted Water manual evidence is missing.");
  }
  expect(Date.parse(String(rows.grow_events[0].occurred_at))).toBe(
    Date.parse(String(payload.p_occurred_at)),
  );
  expect(Date.parse(String(diary.entry_at))).toBe(Date.parse(String(payload.p_occurred_at)));
  expect(Date.parse(String(details.sensor_snapshot.captured_at))).toBe(
    Date.parse(String(payload.p_occurred_at)),
  );
  expect(Number.isFinite(Date.parse(String(rows.grow_events[0].logged_at)))).toBe(true);
  expect(Date.parse(String(diary.logged_at))).toBe(
    Date.parse(String(rows.grow_events[0].logged_at)),
  );
}

for (const mode of ["close/reopen", "reload onto another plant"] as const) {
  test(`accepted Water survives lost reply and ${mode} without a second saved record`, async ({
    page,
    context,
  }) => {
    const f = await createLocalFixture();
    try {
      await fenceBrowser(context, f.env);
      const otherBefore = fingerprint(await witnessRows(f));
      expect(await wateringRows(f.other)).toEqual([]);
      await signIn(page, f);
      await page.goto(plantUrl(f, f.primary));
      await openQuickLog(page);
      await page.locator("#qlv2-target").click();
      await page
        .getByTestId("qlv2-target-content")
        .getByRole("option", {
          name: "Plant · " + f.primary.plantName,
          exact: true,
        })
        .click();
      await page.getByRole("button", { name: "Water", exact: true }).click();
      await page.locator("#qlv2-volume").fill("750");
      const note = "Native Water " + mode + " " + randomUUID();
      await page.locator("#qlv2-note").fill(note);
      await page
        .locator("summary")
        .filter({ hasText: "Manual sensor snapshot (optional)" })
        .click();
      const temperatureLabel = await page.locator('label[for="qlv2-temp"]').innerText();
      await page.locator("#qlv2-temp").fill(temperatureLabel.includes("°F") ? "77" : "25");
      await page.locator("#qlv2-rh").fill("55");

      const requests: Row[] = [];
      const receipts: Array<Row & { grow_event_id: string }> = [];
      let dropped = 0;
      await context.route(f.env.api + "/rest/v1/rpc/quicklog_save_event", async (route) => {
        const request = route.request();
        if (request.method() !== "POST") return route.fallback();
        if (new URL(request.url()).origin !== f.env.api)
          throw new Error("Non-local Water RPC blocked.");
        const payload: unknown = request.postDataJSON();
        if (!isRow(payload)) throw new Error("The real Water request was not an object.");
        requests.push(payload);
        const response = await route.fetch({ maxRedirects: 0 });
        if (new URL(response.url()).origin !== f.env.api || !response.ok()) {
          await route.fulfill({ response });
          return;
        }
        const receipt = acceptedReceipt(await response.json());
        receipts.push(receipt);
        if (dropped === 0 && payload.p_note === note && payload.p_event_type === "watering") {
          dropped += 1;
          await route.abort("failed");
        } else {
          await route.fulfill({ response });
        }
      });
      await page.getByTestId("qlv2-save").click();
      await expect(page.getByTestId("qlv2-watering-retry-lock")).toBeVisible();
      await expect(page.getByTestId("qlv2-save-retry")).toBeEnabled();
      await expect(page.getByTestId("qlv2-error")).toBeVisible();
      await expect(page.getByTestId("qlv2-post-save")).toHaveCount(0);
      expect(dropped).toBe(1);
      expect(requests).toHaveLength(1);
      expect(receipts).toHaveLength(1);
      expect(receipts[0].reused).toBe(false);
      const original = requests[0];
      expect(original).toMatchObject({
        p_grow_id: f.primary.growId,
        p_tent_id: f.primary.tentId,
        p_plant_id: f.primary.plantId,
        p_event_type: "watering",
        p_note: note,
        p_water: { volume_ml: 750 },
        p_sensor_snapshot: {
          source: "manual",
          captured_at: original.p_occurred_at,
          metrics: { temperature_c: 25, humidity_pct: 55 },
        },
      });
      const stored = await pendingWater(page, f.owner.id);
      expect(stored).toMatchObject({
        version: 1,
        ownerId: f.owner.id,
        payload: {
          idempotency_key: original.p_idempotency_key,
          grow_id: f.primary.growId,
          tent_id: f.primary.tentId,
          plant_id: f.primary.plantId,
          occurred_at: original.p_occurred_at,
          note,
          volume_ml: 750,
          sensor_snapshot: original.p_sensor_snapshot,
        },
      });
      const committed = await ownerRows(f.owner);
      const water = await wateringRows(f.owner);
      assertWater(committed, water, f, receipts[0].grow_event_id, original);

      if (mode === "close/reopen") {
        await page
          .getByRole("dialog", { name: "Quick Log", exact: true })
          .getByRole("button", { name: "Close", exact: true })
          .click();
        await expect(page.getByRole("dialog", { name: "Quick Log", exact: true })).toBeHidden();
      } else {
        await page.reload();
        // New route defaults must not replace the frozen original target.
        await page.goto(plantUrl(f, f.secondary));
      }
      await openQuickLog(page);
      await expect(page.getByTestId("qlv2-watering-retry-lock")).toBeVisible();
      await expect(page.getByTestId("qlv2-save-retry")).toBeEnabled();
      await expect(page.locator("#qlv2-volume")).toHaveValue("750");
      await expect(page.locator("#qlv2-volume")).toBeDisabled();
      await expect(page.locator("#qlv2-note")).toHaveValue(note);
      await expect(page.locator("#qlv2-note")).toBeDisabled();
      await expect(page.locator("#qlv2-target")).toBeDisabled();
      await expect(page.locator("#qlv2-target")).toContainText(f.primary.plantName);
      await expect(page.getByTestId("qlv2-post-save")).toHaveCount(0);
      expect(await pendingWater(page, f.owner.id)).toEqual(stored);
      expect(requests).toHaveLength(1);
      expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(committed));
      expect(await wateringRows(f.owner)).toEqual(water);

      await page.getByTestId("qlv2-save-retry").click();
      await expect(page.getByTestId("qlv2-post-save")).toBeVisible();
      expect(requests).toHaveLength(2);
      expect(requests[1]).toEqual(original);
      expect(receipts).toHaveLength(2);
      expect(receipts[1].reused).toBe(true);
      expect(receipts[1].grow_event_id).toBe(receipts[0].grow_event_id);
      expect(await pendingWater(page, f.owner.id)).toBeNull();
      expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(committed));
      expect(await wateringRows(f.owner)).toEqual(water);
      expect(await visibleEventIds(f.other, [receipts[0].grow_event_id])).toEqual([]);
      expect(await wateringRows(f.other)).toEqual([]);
      expect(await visibleEventIds(f.owner, [f.witnessId])).toEqual([]);
      expect(fingerprint(await witnessRows(f))).toBe(otherBefore);

      await page.getByTestId("quick-log-post-save-view").click();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === "/timeline" &&
          url.searchParams.get("growId") === f.primary.growId &&
          url.searchParams.get("tentId") === f.primary.tentId &&
          url.searchParams.get("plantId") === f.primary.plantId &&
          url.hash === "#timeline-entry-" + receipts[0].grow_event_id,
      );
      const anchor = page.locator('[id="timeline-entry-' + receipts[0].grow_event_id + '"]');
      const card = anchor.locator("xpath=ancestor-or-self::li[1]");
      await expect(card).toHaveCount(1);
      await expect(card).toContainText(note);
      await expect(card).toContainText(/watering/i);
      await expect(card.getByTestId("timeline-sensor-source-badge-manual")).toHaveText(
        "Source: manual",
      );
      await expect(card.getByTestId("timeline-sensor-source-badge-live")).toHaveCount(0);
    } finally {
      await page.close();
      await f.cleanup();
    }
  });
}
