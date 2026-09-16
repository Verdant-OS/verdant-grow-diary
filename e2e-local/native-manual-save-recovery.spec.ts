import { test, expect } from "@playwright/test";
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

// Real UI + authenticated readback against the fenced disposable local backend.
// Execute the write, then lose only its reply. No mocked persistence or auth.
test("a manual snapshot accepted before a lost reply must not duplicate on explicit retry", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    const before = await ownerRows(f.owner);
    const otherBefore = fingerprint(await witnessRows(f));
    await signIn(page, f);
    await page.goto(f.env.ui + "/sensors?tentId=" + f.primary.tentId + "#manual-reading");
    const card = page.getByTestId("manual-sensor-reading-card");
    await expect(card.getByTestId("manual-reading-tent-select")).toContainText(f.primary.tentName);
    await card.getByTestId("manual-reading-temp-unit-C").click();
    await card.getByLabel(/Air temp/i).fill("25");
    await card.getByLabel(/Humidity/i).fill("60");
    await card.getByTestId("manual-reading-save").click();
    await expect(card.getByTestId("manual-sensor-review-gate")).toBeVisible();

    const posts: Row[][] = [];
    const writeStatuses: number[] = [];
    let acceptedReplyLost = false;
    let blockRecoveryRead = false;
    let failedRecoveryReads = 0;
    await page.route("**/rest/v1/sensor_readings**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        blockRecoveryRead &&
        url.origin === f.env.api &&
        url.pathname === "/rest/v1/sensor_readings" &&
        request.method() === "GET" &&
        url.searchParams.get("source") === "eq.manual" &&
        url.searchParams.get("captured_at")?.startsWith("eq.")
      ) {
        failedRecoveryReads += 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"message":"Local recovery read unavailable"}',
        });
      }
      if (
        url.origin !== f.env.api ||
        url.pathname !== "/rest/v1/sensor_readings" ||
        request.method() !== "POST"
      ) {
        return route.fallback();
      }
      const payload: unknown = request.postDataJSON();
      if (!Array.isArray(payload) || !payload.every(isRow)) {
        throw new Error("Unexpected local manual snapshot payload.");
      }
      posts.push(payload);
      const response = await route.fetch({ maxRedirects: 0 });
      if (new URL(response.url()).origin !== f.env.api)
        throw new Error("Local write left its allowed origin.");
      writeStatuses.push(response.status());
      if (!acceptedReplyLost) {
        if (!response.ok())
          throw new Error("The first local manual snapshot write was not accepted.");
        acceptedReplyLost = true;
        await route.abort("connectionreset");
      } else {
        await route.fulfill({ response });
      }
    });
    await card.getByTestId("manual-sensor-review-confirm").click();
    await expect.poll(() => acceptedReplyLost).toBe(true);
    await expect(card.getByTestId("manual-sensor-review-confirm")).toBeEnabled();
    await expect(card.getByTestId("manual-reading-saved-confirmation")).toHaveCount(0);
    await expect(card.getByLabel(/Air temp/i)).toHaveValue("25");
    await expect(card.getByLabel(/Humidity/i)).toHaveValue("60");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toHaveLength(2);

    const initial = (await ownerRows(f.owner)).sensor_readings;
    expect(initial).toHaveLength(2);
    for (const metric of ["temperature_c", "humidity_pct"] as const) {
      const matching = initial.filter((row) => row.metric === metric);
      expect(matching).toHaveLength(1);
      expect(matching[0]).toMatchObject({
        user_id: f.owner.id,
        tent_id: f.primary.tentId,
        source: "manual",
        value: metric === "temperature_c" ? 25 : 60,
      });
    }
    expect(new Set(initial.map((row) => row.captured_at)).size).toBe(1);

    // The user retries the same still-populated review; no new measurement.
    // Its real duplicate response cannot confirm a save while readback fails.
    blockRecoveryRead = true;
    await card.getByTestId("manual-sensor-review-confirm").click();
    await expect.poll(() => failedRecoveryReads).toBeGreaterThan(0);
    await expect(card.getByTestId("manual-sensor-review-confirm")).toBeEnabled();
    await expect(card.getByTestId("manual-reading-saved-confirmation")).toHaveCount(0);
    await expect(card.getByTestId("manual-reading-save-unconfirmed")).toContainText(
      "save is unconfirmed",
    );
    expect((await ownerRows(f.owner)).sensor_readings).toHaveLength(2);
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(posts[0]);
    blockRecoveryRead = false;
    await card.getByTestId("manual-sensor-review-confirm").click();
    await expect(card.getByTestId("manual-reading-saved-confirmation")).toBeVisible();
    expect(posts).toHaveLength(3);
    expect(posts[2]).toEqual(posts[0]);
    const after = await ownerRows(f.owner);
    const saved = after.sensor_readings;
    for (const table of ["grow_events", "diary_entries", "environment_events"] as const) {
      expect(after[table]).toEqual(before[table]);
    }
    expect(saved.every((row) => row.tent_id === f.primary.tentId && row.source === "manual")).toBe(
      true,
    );
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);
    const otherRead = await f.other.client
      .from("sensor_readings")
      .select("id")
      .eq("tent_id", f.primary.tentId);
    expect(otherRead.error).toBeNull();
    expect(otherRead.data).toEqual([]);

    await page.goto(f.env.ui + "/tents/" + f.primary.tentId);
    const history = page.getByTestId("tent-manual-snapshot-history");
    await expect(history).toBeVisible();
    await expect(history.getByTestId("tent-manual-snapshot-history-item").first()).toBeVisible();
    const visibleSnapshots = await history.getByTestId("tent-manual-snapshot-history-item").count();
    await page.reload();
    await expect(history.getByTestId("tent-manual-snapshot-history-item").first()).toBeVisible();
    const reopenedSnapshots = await history
      .getByTestId("tent-manual-snapshot-history-item")
      .count();
    const observation = {
      initialRows: initial.length,
      rowsAfterRetry: saved.length,
      writeRequests: posts.length,
      writeStatuses,
      failedRecoveryReads,
      capturedTimesAfterRetry: new Set(saved.map((row) => row.captured_at)).size,
      visibleSnapshots,
      reopenedSnapshots,
      sourceRemainsManual: saved.every((row) => row.source === "manual"),
      otherOwnerUnchanged: fingerprint(await witnessRows(f)) === otherBefore,
    };
    console.log("Native manual lost-reply observation:", JSON.stringify(observation));
    expect(
      saved.length,
      "Retrying the same manual snapshot must preserve its original row count",
    ).toBe(initial.length);
    expect(fingerprint(after)).toBe(fingerprint({ ...before, sensor_readings: initial }));
    expect(visibleSnapshots).toBe(1);
    expect(reopenedSnapshots).toBe(1);
  } finally {
    await page.close();
    await f.cleanup();
  }
});
