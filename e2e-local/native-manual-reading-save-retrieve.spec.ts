import { expect, test } from "@playwright/test";
import {
  createLocalFixture,
  fenceBrowser,
  fingerprint,
  isRow,
  ownerRows,
  signIn,
  witnessRows,
  type Row,
} from "./lib/nativeLocalFixtures";

// The Sensors form path is distinct from Quick Log's manual snapshot. This
// proof drives the real form and checks the disposable backend with the
// authenticated owner's JWT; it never claims published-site acceptance.
test("Sensors manual entry saves three metrics to the chosen tent and reopens in manual history", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    const before = await ownerRows(f.owner);
    const otherBefore = fingerprint(await witnessRows(f));
    expect(before.sensor_readings).toHaveLength(0);

    await signIn(page, f);
    await page.goto(
      f.env.ui + "/sensors?tentId=" + f.primary.tentId + "&tentIntent=required#manual-reading",
    );
    const card = page.getByTestId("manual-sensor-reading-card");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-correction-mode", "false");
    await expect(page.getByTestId("manual-reading-tent-select")).toContainText(f.primary.tentName);
    await page.getByTestId("manual-reading-temp-unit-C").click();
    await page.locator("#m-air-temp").fill("26");
    await page.locator("#m-humidity").fill("60");
    await page.locator("#m-soil").fill("42");
    const postRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.origin === f.env.api &&
        url.pathname === "/rest/v1/sensor_readings" &&
        request.method() === "POST"
      ) {
        postRequests.push(request.url());
      }
    });
    await page.getByTestId("manual-reading-save").click();
    await expect(page.getByTestId("manual-reading-review-prompt")).toBeVisible();
    await expect(page.getByTestId("manual-reading-saved-confirmation")).toHaveCount(0);
    expect(postRequests).toHaveLength(0);
    expect((await ownerRows(f.owner)).sensor_readings).toHaveLength(0);

    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === f.env.api &&
        url.pathname === "/rest/v1/sensor_readings" &&
        response.request().method() === "POST"
      );
    });
    const confirmStartedAt = Date.now();
    await page.getByTestId("manual-sensor-review-confirm").click();
    const response = await responsePromise;
    const responseReceivedAt = Date.now();
    expect(response.ok()).toBe(true);
    expect(postRequests).toHaveLength(1);
    const payload: unknown = response.request().postDataJSON();
    if (!Array.isArray(payload) || payload.some((row: unknown) => !isRow(row))) {
      throw new Error("Manual snapshot request was not a row batch.");
    }
    const posted = payload as Row[];
    expect(posted).toHaveLength(3);
    const expected = new Map([
      ["temperature_c", 26],
      ["humidity_pct", 60],
      ["soil_moisture_pct", 42],
    ]);
    const capturedAt = posted[0].captured_at;
    expect(typeof capturedAt).toBe("string");
    expect(Number.isFinite(Date.parse(String(capturedAt)))).toBe(true);
    expect(Date.parse(String(capturedAt))).toBeGreaterThanOrEqual(confirmStartedAt - 1000);
    expect(Date.parse(String(capturedAt))).toBeLessThanOrEqual(responseReceivedAt + 1000);
    for (const row of posted) {
      expect(row).toMatchObject({
        tent_id: f.primary.tentId,
        source: "manual",
        quality: "ok",
        captured_at: capturedAt,
        ts: capturedAt,
      });
      expect(row.value).toBe(expected.get(String(row.metric)));
      expect(row.user_id).toBeUndefined();
      expect(row.raw_payload).toMatchObject({ manual_provenance: expect.anything() });
    }
    expect(posted.map((row) => row.metric).sort()).toEqual([...expected.keys()].sort());
    await expect(page.getByTestId("manual-reading-saved-confirmation")).toBeVisible();
    await expect(page.getByTestId("manual-reading-save-unconfirmed")).toHaveCount(0);

    const saved = await ownerRows(f.owner);
    expect(saved.sensor_readings).toHaveLength(3);
    expect(saved.grow_events).toEqual(before.grow_events);
    expect(saved.diary_entries).toEqual(before.diary_entries);
    expect(saved.environment_events).toEqual(before.environment_events);
    for (const row of saved.sensor_readings) {
      expect(row).toMatchObject({
        user_id: f.owner.id,
        tent_id: f.primary.tentId,
        source: "manual",
        quality: "ok",
      });
      expect(row.value).toBe(expected.get(String(row.metric)));
      expect(Date.parse(String(row.captured_at))).toBe(Date.parse(String(capturedAt)));
      expect(Date.parse(String(row.ts))).toBe(Date.parse(String(capturedAt)));
    }
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);

    await page.reload();
    await page.goto(f.env.ui + "/tents/" + f.primary.tentId);
    const history = page.getByTestId("tent-manual-snapshot-history");
    await expect(history.getByTestId("tent-manual-snapshot-history-item")).toHaveCount(1);
    await expect(history.getByTestId("tent-manual-snapshot-history-source")).toHaveText("Manual");
    // Label and value are adjacent spans with no text node between them; the
    // visible gap is CSS, so textContent reads "Temp78.8°F".
    await expect(history.locator('[data-metric="temperature_c"]')).toHaveText(
      /^Temp\s*78\.8\s*°F$/,
    );
    await expect(history.locator('[data-metric="humidity_pct"]')).toHaveText(/^RH\s*60\s*%$/);
    await expect(history.locator('[data-metric="soil_moisture_pct"]')).toHaveText(
      /^Soil\s*42\s*%$/,
    );
    await expect(history.locator('[data-metric="vpd_kpa"]')).toHaveCount(0);
    // Timeline ids carry captured_at as PostgREST returns it ("…+00:00"), not
    // the client's toISOString() "…Z" that was posted.
    const storedCapturedAt = new Set(saved.sensor_readings.map((row) => row.captured_at));
    expect(storedCapturedAt.size).toBe(1);
    const [receiptCapturedAt] = storedCapturedAt;
    await page.goto(f.env.ui + "/timeline?growId=" + f.primary.growId);
    const timelineReceipt = page.locator(
      '[id="timeline-entry-sensor-reading:' +
        f.primary.tentId +
        ":" +
        String(receiptCapturedAt) +
        '"]',
    );
    await expect(timelineReceipt).toHaveCount(1);
    await expect(timelineReceipt).toContainText("Manual sensor snapshot: 78.8°F, 60% RH");
    await expect(timelineReceipt.getByTestId("timeline-sensor-source-badge-manual")).toHaveText(
      "Source: manual",
    );
    await page.goto(f.env.ui + "/tents/" + f.secondary.tentId);
    await expect(page.getByTestId("tent-manual-snapshot-history-empty")).toBeVisible();
    expect(postRequests).toHaveLength(1);
    expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(saved));
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);
  } finally {
    await page.close();
    await f.cleanup();
  }
});

test("committed Sensors manual snapshot survives a lost reply and retries the original tent without duplicate rows", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    const otherBefore = fingerprint(await witnessRows(f));
    const requests: Row[][] = [];
    await context.route(f.env.api + "/rest/v1/sensor_readings*", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const payload: unknown = route.request().postDataJSON();
      if (!Array.isArray(payload) || payload.some((row: unknown) => !isRow(row))) {
        throw new Error("Manual snapshot retry request was not a row batch.");
      }
      requests.push(structuredClone(payload as Row[]));
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
      if (requests.length === 1) {
        expect(response.ok()).toBe(true);
        return route.abort("connectionreset");
      }
      expect(response.status()).toBe(409);
      const rejection: unknown = await response.json();
      if (!isRow(rejection)) throw new Error("Retry conflict was not an object.");
      expect(rejection.code).toBe("23505");
      return route.fulfill({ response });
    });

    await signIn(page, f);
    await page.goto(
      f.env.ui + "/sensors?tentId=" + f.primary.tentId + "&tentIntent=required#manual-reading",
    );
    await expect(page.getByTestId("manual-reading-tent-select")).toContainText(f.primary.tentName);
    await page.getByTestId("manual-reading-temp-unit-C").click();
    await page.locator("#m-air-temp").fill("26");
    await page.locator("#m-humidity").fill("60");
    await page.locator("#m-soil").fill("42");
    await page.getByTestId("manual-reading-save").click();
    await page.getByTestId("manual-sensor-review-confirm").click();
    await expect(page.getByTestId("manual-reading-save-unconfirmed")).toBeVisible();
    await expect(page.getByTestId("manual-reading-saved-confirmation")).toHaveCount(0);
    expect(requests).toHaveLength(1);
    const committed = await ownerRows(f.owner);
    expect(committed.sensor_readings).toHaveLength(3);
    expect(committed.sensor_readings.every((row) => row.tent_id === f.primary.tentId)).toBe(true);

    // A full document navigation onto another owned tent must restore the
    // pending original target, not send a new snapshot to the visible URL.
    await page.goto(
      f.env.ui + "/sensors?tentId=" + f.secondary.tentId + "&tentIntent=required#manual-reading",
    );
    await expect(page.getByTestId("manual-reading-tent-select")).toContainText(f.primary.tentName);
    await expect(page.locator("#m-air-temp")).toHaveValue("26");
    await expect(page.locator("#m-humidity")).toHaveValue("60");
    await expect(page.locator("#m-soil")).toHaveValue("42");
    await expect(page.getByTestId("manual-reading-save-unconfirmed")).toBeVisible();
    await expect(page.getByTestId("manual-reading-saved-confirmation")).toHaveCount(0);
    await page.getByTestId("manual-reading-save").click();
    await page.getByTestId("manual-sensor-review-confirm").click();
    await expect(page.getByTestId("manual-reading-saved-confirmation")).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(committed));
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);

    await page.goto(f.env.ui + "/tents/" + f.primary.tentId);
    const history = page.getByTestId("tent-manual-snapshot-history");
    await expect(history.getByTestId("tent-manual-snapshot-history-item")).toHaveCount(1);
    await expect(history.getByTestId("tent-manual-snapshot-history-source")).toHaveText("Manual");
    await page.goto(f.env.ui + "/tents/" + f.secondary.tentId);
    await expect(page.getByTestId("tent-manual-snapshot-history-empty")).toBeVisible();
  } finally {
    await page.close();
    await f.cleanup();
  }
});
