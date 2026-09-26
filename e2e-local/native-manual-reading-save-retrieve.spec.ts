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
    await page.getByTestId("manual-reading-save").click();
    await expect(page.getByTestId("manual-reading-review-prompt")).toBeVisible();
    await expect(page.getByTestId("manual-reading-saved-confirmation")).toHaveCount(0);

    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === f.env.api &&
        url.pathname === "/rest/v1/sensor_readings" &&
        response.request().method() === "POST"
      );
    });
    await page.getByTestId("manual-sensor-review-confirm").click();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
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
    await expect(history.locator('[data-metric="temperature_c"]')).toHaveText("Temp 78.8°F");
    await expect(history.locator('[data-metric="humidity_pct"]')).toHaveText("RH 60%");
    await expect(history.locator('[data-metric="soil_moisture_pct"]')).toHaveText("Soil 42%");
    await expect(history.locator('[data-metric="vpd_kpa"]')).toHaveCount(0);
    await page.goto(f.env.ui + "/tents/" + f.secondary.tentId);
    await expect(page.getByTestId("tent-manual-snapshot-history-empty")).toBeVisible();
    expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(saved));
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);
  } finally {
    await page.close();
    await f.cleanup();
  }
});
