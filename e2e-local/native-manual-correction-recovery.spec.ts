import { test, expect, type Page } from "@playwright/test";
import {
  createLocalFixture,
  fenceBrowser,
  fingerprint,
  isRow,
  ownerRows,
  signIn,
  witnessRows,
  type Account,
  type LocalFixture,
  type Row,
} from "./lib/nativeLocalFixtures";

async function correctionRows(account: Account, table: string): Promise<Row[]> {
  const { data, error } = await account.client.from(table).select("*");
  if (
    error ||
    !Array.isArray(data) ||
    data.some((row) => !isRow(row) || row.user_id !== account.id)
  ) {
    throw new Error("Authenticated correction read failed its owner boundary.");
  }
  return data;
}

const ledger = (account: Account) => correctionRows(account, "manual_sensor_correction_operations");

async function seedHumidityAndLink(f: LocalFixture): Promise<string> {
  // An authenticated fixture insert, restricted to the disposable local backend.
  const { error } = await f.owner.client.from("sensor_readings").insert({
    user_id: f.owner.id,
    tent_id: f.primary.tentId,
    metric: "humidity_pct",
    value: 55,
    source: "manual",
    quality: "ok",
    captured_at: f.manualAt,
    ts: f.manualAt,
    raw_payload: { fixture: "native-local-manual" },
  });
  if (error) throw new Error("Local manual humidity setup failed.");
  const rows = (await ownerRows(f.owner)).sensor_readings.filter(
    (row) => row.tent_id === f.primary.tentId && row.source === "manual",
  );
  expect(rows).toHaveLength(2);
  const params = new URLSearchParams({
    correct: "1",
    tent_id: f.primary.tentId,
    captured_at: f.manualAt,
  });
  for (const row of rows) {
    expect(Date.parse(String(row.captured_at))).toBe(Date.parse(f.manualAt));
    params.set("r_" + row.metric, String(row.id));
    params.set("v_" + row.metric, String(row.value));
  }
  return f.env.ui + "/sensors?tentId=" + f.primary.tentId + "#manual-reading?" + params;
}

async function editCorrection(page: Page, href: string) {
  await page.goto(href);
  await expect(page.getByTestId("manual-sensor-reading-card")).toHaveAttribute(
    "data-correction-mode",
    "true",
  );
  await page.getByTestId("manual-reading-temp-unit-C").click();
  await page.locator("#m-air-temp").fill("26");
  await page.locator("#m-humidity").fill("60");
}

async function confirm(page: Page) {
  await page.getByTestId("manual-reading-save").click();
  await expect(page.getByTestId("manual-sensor-review-confirm")).toBeEnabled();
  await page.getByTestId("manual-sensor-review-confirm").click();
}

async function expectEffective(f: LocalFixture, temperature: number, humidity: number) {
  const all = await correctionRows(f.owner, "sensor_readings_effective");
  const manual = all.filter((row) => row.tent_id === f.primary.tentId && row.source === "manual");
  expect(manual).toHaveLength(2);
  expect(manual.find((row) => row.metric === "temperature_c")?.value).toBe(temperature);
  expect(manual.find((row) => row.metric === "humidity_pct")?.value).toBe(humidity);
  for (const row of manual) {
    expect(row.correction_valid).toBe(true);
    expect(Date.parse(String(row.captured_at))).toBe(Date.parse(f.manualAt));
    expect(Date.parse(String(row.ts))).toBe(Date.parse(f.manualAt));
  }
  const stale = all.filter((row) => row.tent_id === f.primary.tentId && row.source === "live");
  expect(stale).toHaveLength(55);
  expect(stale.every((row) => row.value === 30)).toBe(true);
  expect(stale.every((row) => Date.parse(String(row.captured_at)) <= Date.parse(f.staleAt))).toBe(
    true,
  );
  // The same owner's other tent is a positive target-isolation witness.
  const secondary = all.filter((row) => row.tent_id === f.secondary.tentId);
  expect(secondary).toHaveLength(1);
  expect(secondary[0]).toMatchObject({ value: 29, source: "live" });
}

function requestEnvelope(value: unknown): Row & { p_request: Row } {
  if (
    !isRow(value) ||
    !isRow(value.p_request) ||
    !Array.isArray(value.p_request.changes) ||
    !Array.isArray(value.p_request.originals)
  ) {
    throw new Error("Malformed browser correction request.");
  }
  return value as Row & { p_request: Row };
}

test("lost committed correction reply reopens the original tent and retries one persisted operation", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture(true);
  try {
    await fenceBrowser(context, f.env);
    const href = await seedHumidityAndLink(f);
    const before = fingerprint(await ownerRows(f.owner));
    const otherBefore = fingerprint(await witnessRows(f));
    const calls: Row[] = [];
    const replies: Row[] = [];
    await page.route(f.env.api + "/rest/v1/rpc/save_manual_sensor_correction", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const payload = requestEnvelope(route.request().postDataJSON());
      calls.push(payload);
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
      expect(response.ok()).toBe(true);
      const reply: unknown = await response.json();
      if (!isRow(reply)) throw new Error("Real correction receipt was not an object.");
      expect(reply.request).toEqual(payload.p_request);
      replies.push(reply);
      if (calls.length === 1) return route.abort("connectionreset");
      return route.fulfill({ response });
    });
    await signIn(page, f);
    await editCorrection(page, href);
    await confirm(page);
    await expect(page.getByTestId("manual-reading-save-unconfirmed")).toBeVisible();
    await expect(page.getByTestId("manual-reading-saved-confirmation")).not.toBeVisible();
    expect(calls).toHaveLength(1);
    const first = await ledger(f.owner);
    expect(first).toHaveLength(1);
    expect(first[0].request).toEqual(calls[0].p_request);
    await expectEffective(f, 26, 60);

    // Reload without the correction hash on another owned target. Recovery must
    // restore the original target and edited values, not send a fresh snapshot.
    await page.goto(f.env.ui + "/sensors?tentId=" + f.secondary.tentId);
    await page.getByRole("link", { name: "Reopen pending correction", exact: true }).click();
    await expect(page).toHaveURL((url) => url.hash.includes(f.primary.tentId));
    const unit = await page
      .getByTestId("manual-reading-temp-unit-toggle")
      .getAttribute("data-active-unit");
    expect(["C", "F"]).toContain(unit);
    await expect(page.locator("#m-air-temp")).toHaveValue(unit === "F" ? "78.8" : "26");
    await page.getByTestId("manual-reading-temp-unit-C").click();
    await expect(page.locator("#m-air-temp")).toHaveValue("26");
    await expect(page.locator("#m-humidity")).toHaveValue("60");
    await confirm(page);
    await expect(page.getByTestId("manual-reading-saved-confirmation")).toBeVisible();
    await expect(page.getByTestId("manual-reading-save-unconfirmed")).not.toBeVisible();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(replies[0].reused).toBe(false);
    expect(replies[1].reused).toBe(true);
    expect(replies[1].revision).toBe(replies[0].revision);
    expect(await ledger(f.owner)).toEqual(first);
    await expectEffective(f, 26, 60);
    expect(fingerprint(await ownerRows(f.owner))).toBe(before);
    expect(await ledger(f.other)).toEqual([]);
    await correctionRows(f.other, "sensor_readings_effective");
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);
  } finally {
    await page.close();
    await f.cleanup();
  }
});

test("a database-rejected multi-metric correction writes nothing and the original intent can retry", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture(true);
  try {
    await fenceBrowser(context, f.env);
    const href = await seedHumidityAndLink(f);
    const before = fingerprint(await ownerRows(f.owner));
    const otherBefore = fingerprint(await witnessRows(f));
    const calls: Row[] = [];
    const statuses: number[] = [];
    await page.route(f.env.api + "/rest/v1/rpc/save_manual_sensor_correction", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const payload = requestEnvelope(route.request().postDataJSON());
      calls.push(payload);
      const forwarded = structuredClone(payload);
      if (calls.length === 1) {
        // Real backend conflict, not a synthetic failure response: preserve
        // request shape but make one expected original disagree with storage.
        const changes = forwarded.p_request.changes as Row[];
        const originals = forwarded.p_request.originals as Row[];
        const change = changes[0];
        const original = originals.find((row) => row.readingId === change.originalReadingId);
        if (!original || typeof original.value !== "number")
          throw new Error("Missing original fixture value.");
        original.value += 1;
        change.expectedValue = original.value;
      }
      const headers = { ...route.request().headers() };
      // A changed body must get its own byte length. Never forward the browser's
      // original content-length with a replacement JSON payload.
      delete headers["content-length"];
      const response = await route.fetch({
        headers,
        postData: JSON.stringify(forwarded),
        maxRedirects: 0,
        maxRetries: 0,
      });
      statuses.push(response.status());
      if (calls.length === 1) {
        expect(response.status()).toBe(409);
        const rejection: unknown = await response.json();
        expect(rejection).toMatchObject({ code: "PT409", message: "correction_original_conflict" });
      } else {
        expect(response.ok()).toBe(true);
      }
      return route.fulfill({ response });
    });
    await signIn(page, f);
    await editCorrection(page, href);
    await confirm(page);
    await expect(page.getByTestId("manual-reading-save-unconfirmed")).toBeVisible();
    await expect(page.getByTestId("manual-reading-saved-confirmation")).not.toBeVisible();
    expect(calls).toHaveLength(1);
    expect(await ledger(f.owner)).toEqual([]);
    await expectEffective(f, 25, 55);
    expect(fingerprint(await ownerRows(f.owner))).toBe(before);
    await expect(page.locator("#m-air-temp")).toHaveValue("26");
    await expect(page.locator("#m-humidity")).toHaveValue("60");
    // A rejected request keeps the review open. Retry through that existing
    // confirmation instead of opening a second review after the retry saves.
    await expect(page.getByTestId("manual-sensor-review-confirm")).toBeEnabled();
    await page.getByTestId("manual-sensor-review-confirm").click();
    await expect(page.getByTestId("manual-reading-saved-confirmation")).toBeVisible();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(statuses[0]).toBeGreaterThanOrEqual(400);
    expect(statuses[1]).toBeLessThan(300);
    const saved = await ledger(f.owner);
    expect(saved).toHaveLength(1);
    expect(saved[0].request).toEqual(calls[1].p_request);
    await expectEffective(f, 26, 60);
    expect(fingerprint(await ownerRows(f.owner))).toBe(before);
    expect(await ledger(f.other)).toEqual([]);
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);
  } finally {
    await page.close();
    await f.cleanup();
  }
});
