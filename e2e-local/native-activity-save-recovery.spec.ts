import { test, expect } from "@playwright/test";
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
  type Row,
} from "./lib/nativeLocalFixtures";

test("an accepted Daily Check activity with a lost reply stays unconfirmed and retries without duplicate history", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    const before = await ownerRows(f.owner);
    const otherBefore = fingerprint(await witnessRows(f));
    await signIn(page, f);
    await page.goto(
      f.env.ui + "/daily-check?growId=" + f.primary.growId + "&plantId=" + f.primary.plantId,
    );
    await expect(page.getByTestId("daily-grow-check-plant-select")).toContainText(
      f.primary.plantName,
    );
    const section = page.getByTestId("daily-check-all-activities");
    await section.getByRole("button", { name: "More activity types" }).click();
    await section.getByTestId("daily-check-all-activities-picker-training").click();
    await section
      .getByTestId("daily-check-all-activities-detail-technique")
      .selectOption("topping");
    const note = "Native training retry " + randomUUID();
    await section.getByTestId("daily-check-all-activities-note").fill(note);

    const posts: Row[] = [];
    const receipts: Row[] = [];
    let lostReply = false;
    await page.route(f.env.api + "/rest/v1/rpc/quicklog_save_event", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const payload: unknown = route.request().postDataJSON();
      if (!isRow(payload)) throw new Error("Local activity payload is malformed.");
      posts.push(payload);
      const response = await route.fetch({ maxRedirects: 0 });
      if (new URL(response.url()).origin !== f.env.api || !response.ok()) {
        throw new Error("Local activity save was not accepted at its fenced backend.");
      }
      receipts.push(acceptedReceipt(await response.json()));
      if (!lostReply) {
        lostReply = true;
        await route.abort("connectionreset");
      } else {
        await route.fulfill({ response });
      }
    });

    const save = section.getByTestId("daily-check-all-activities-save");
    await save.click();
    await expect(section.getByTestId("daily-check-all-activities-error")).toBeVisible();
    await expect(save).toBeEnabled();
    const falseEmptyCopy = /nothing was saved/i.test(
      await section.getByTestId("daily-check-all-activities-error").innerText(),
    );
    await expect(section.getByTestId("daily-check-all-activities-saved")).toHaveCount(0);
    await expect(section.getByTestId("daily-check-all-activities-note")).toHaveValue(note);
    const initial = await ownerRows(f.owner);
    expect(initial.grow_events).toHaveLength(1);
    expect(initial.diary_entries).toHaveLength(1);
    expect(initial.grow_events[0]).toMatchObject({
      user_id: f.owner.id,
      grow_id: f.primary.growId,
      tent_id: f.primary.tentId,
      plant_id: f.primary.plantId,
      event_type: "training",
      source: "manual",
      note,
    });

    await save.click();
    await expect(section.getByTestId("daily-check-all-activities-saved")).toBeVisible();
    expect(posts).toHaveLength(2);
    const after = await ownerRows(f.owner);
    expect(after.sensor_readings).toEqual(before.sensor_readings);
    expect(after.environment_events).toEqual(before.environment_events);
    const ids = after.grow_events.map((row) => String(row.id));
    expect(await visibleEventIds(f.other, ids)).toEqual([]);
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);
    const timeline =
      f.env.ui +
      "/timeline?growId=" +
      f.primary.growId +
      "&tentId=" +
      f.primary.tentId +
      "&plantId=" +
      f.primary.plantId;
    await page.goto(timeline);
    for (const id of ids)
      await expect(page.locator('[id="timeline-entry-' + id + '"]')).toHaveCount(1);
    await page.reload();
    for (const id of ids) {
      const anchor = page.locator('[id="timeline-entry-' + id + '"]');
      await expect(anchor).toHaveCount(1);
      await expect(anchor.locator("xpath=ancestor-or-self::li[1]")).toContainText(note);
    }
    console.log(
      "Native activity lost-reply observation:",
      JSON.stringify({
        initialEvents: initial.grow_events.length,
        finalEvents: after.grow_events.length,
        initialDiaryRows: initial.diary_entries.length,
        finalDiaryRows: after.diary_entries.length,
        writes: posts.length,
        distinctKeys: new Set(posts.map((row) => row.p_idempotency_key)).size,
        secondReceiptReused: receipts[1].reused === true,
        falseEmptyCopy,
        reopenedEvents: ids.length,
        sourceRemainsManual: after.grow_events.every((row) => row.source === "manual"),
        otherOwnerUnchanged: fingerprint(await witnessRows(f)) === otherBefore,
      }),
    );
    expect.soft(falseEmptyCopy, "A lost reply cannot prove that nothing was saved").toBe(false);
    expect.soft(after.grow_events.length, "Retry must preserve one canonical activity").toBe(1);
    expect.soft(after.diary_entries.length, "Retry must preserve one diary companion").toBe(1);
    expect
      .soft(posts[1].p_idempotency_key, "Retry must retain its logical save key")
      .toBe(posts[0].p_idempotency_key);
    expect.soft(receipts[1].reused).toBe(true);
  } finally {
    await page.close();
    await f.cleanup();
  }
});
