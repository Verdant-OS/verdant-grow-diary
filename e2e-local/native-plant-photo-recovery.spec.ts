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
  type LocalFixture,
  type Row,
} from "./lib/nativeLocalFixtures";

// A synthetic one-pixel PNG, never a grower's private media.
const imageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

async function removeFixturePhotos(f: LocalFixture, paths: Set<string>): Promise<void> {
  if (paths.size === 0) return;
  const { error } = await f.owner.client.storage.from("diary-photos").remove([...paths]);
  if (error) throw new Error("Disposable photo cleanup failed.");
}

test("a committed Plant Quick Log photo survives a lost reply, explicit retry and Timeline reopening", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture();
  const uploadedPaths = new Set<string>();
  let deletes = 0;
  const payloads: Row[] = [];
  const receipts: Row[] = [];
  try {
    await fenceBrowser(context, f.env);
    const otherBefore = fingerprint(await witnessRows(f));
    await signIn(page, f);
    await page.goto(f.env.ui + "/plants/" + f.primary.plantId);
    await page.getByTestId("plant-detail-quick-log-open").click();
    await expect(page.getByTestId("plant-quick-log-sheet")).toBeVisible();
    const note = "Native uncertain photo " + randomUUID();
    await page.getByTestId("plant-quick-log-note").fill(note);
    await page.getByTestId("plant-quick-log-photo-library-input").setInputFiles({
      name: "isolated-photo.png",
      mimeType: "image/png",
      buffer: imageBytes,
    });
    await expect(page.getByTestId("plant-quick-log-photo-preview")).toBeVisible();

    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== f.env.api) return;
      const prefix = "/storage/v1/object/diary-photos/";
      if (request.method() === "POST" && url.pathname.startsWith(prefix)) {
        const path = decodeURIComponent(url.pathname.slice(prefix.length));
        if (!path.startsWith(f.owner.id + "/" + f.primary.growId + "/")) {
          throw new Error("Photo upload escaped the authenticated fixture scope.");
        }
        uploadedPaths.add(path);
      }
      if (request.method() === "DELETE" && url.pathname === "/storage/v1/object/diary-photos")
        deletes++;
    });
    await page.route(f.env.api + "/rest/v1/rpc/quicklog_save_manual", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const payload: unknown = route.request().postDataJSON();
      if (!isRow(payload)) throw new Error("Photo save payload is malformed.");
      payloads.push(payload);
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      const receipt = acceptedReceipt(await response.json());
      receipts.push(receipt);
      if (payloads.length === 1) {
        const details = isRow(payload.p_details) ? payload.p_details : {};
        expect(typeof details.photo_url).toBe("string");
        const uploaded = await f.owner.client.storage
          .from("diary-photos")
          .download(String(details.photo_url));
        expect(uploaded.error).toBeNull();
        expect(Buffer.from(await uploaded.data!.arrayBuffer())).toEqual(imageBytes);
        return route.abort("connectionreset");
      }
      return route.fulfill({ response });
    });

    await page.getByTestId("plant-quick-log-save").click();
    await expect(page.getByTestId("plant-quick-log-error")).toBeVisible();
    await expect(page.getByTestId("plant-quick-log-save")).toBeEnabled();
    await expect(page.getByTestId("plant-quick-log-note")).toHaveValue(note);
    const first = await ownerRows(f.owner);
    expect(first.grow_events).toHaveLength(1);
    expect(first.diary_entries).toHaveLength(1);
    const originalDetails = isRow(first.diary_entries[0].details)
      ? first.diary_entries[0].details
      : {};
    const originalPath = String(originalDetails.photo_url);
    expect(uploadedPaths.has(originalPath)).toBe(true);
    expect(first.grow_events[0]).toMatchObject({
      id: receipts[0].grow_event_id,
      user_id: f.owner.id,
      grow_id: f.primary.growId,
      tent_id: f.primary.tentId,
      plant_id: f.primary.plantId,
      source: "manual",
      note,
    });
    const afterUncertain = await f.owner.client.storage.from("diary-photos").download(originalPath);
    const photoSurvivedUncertain = !afterUncertain.error && !!afterUncertain.data;

    await page.getByTestId("plant-quick-log-save").click();
    await expect(page.getByTestId("plant-quick-log-sheet")).not.toBeVisible();
    const final = await ownerRows(f.owner);
    expect(final.grow_events).toHaveLength(1);
    expect(final.diary_entries).toHaveLength(1);
    expect(final.sensor_readings).toEqual(first.sensor_readings);
    expect(final.environment_events).toEqual(first.environment_events);
    const diaryDetails = isRow(final.diary_entries[0].details)
      ? final.diary_entries[0].details
      : {};
    const recovered = await f.owner.client.storage.from("diary-photos").download(originalPath);
    const originalPhotoReadable = !recovered.error && !!recovered.data;
    const otherPhoto = await f.other.client.storage.from("diary-photos").download(originalPath);
    expect(otherPhoto.data).toBeNull();
    expect(otherPhoto.error).not.toBeNull();
    expect(await visibleEventIds(f.other, [String(receipts[0].grow_event_id)])).toEqual([]);
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);

    const timelineUrl =
      f.env.ui +
      "/timeline?growId=" +
      f.primary.growId +
      "&tentId=" +
      f.primary.tentId +
      "&plantId=" +
      f.primary.plantId;
    await page.goto(timelineUrl);
    await page.reload();
    const card = page
      .locator('[id="timeline-entry-' + receipts[0].grow_event_id + '"]')
      .locator("xpath=ancestor-or-self::li[1]");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(note);
    const photo = card.getByTestId("timeline-photo-open").locator("img");
    const photoIsLoaded = () =>
      photo.evaluateAll(
        (images) => images.length === 1 && (images[0] as HTMLImageElement).naturalWidth > 0,
      );
    await expect.soft.poll(photoIsLoaded).toBe(true);

    const observation = {
      events: final.grow_events.length,
      diaryRows: final.diary_entries.length,
      writes: payloads.length,
      uploads: uploadedPaths.size,
      deletes,
      distinctKeys: new Set(payloads.map((p) => p.p_idempotency_key)).size,
      receiptReused: receipts[1]?.reused === true,
      photoSurvivedUncertain,
      originalPhotoReadable,
      referencesAgree:
        diaryDetails.photo_url === originalPath &&
        (!final.diary_entries[0].photo_url || final.diary_entries[0].photo_url === originalPath),
      sourceRemainsManual: final.grow_events[0].source === "manual",
      reopenedPhotoVisible: await photoIsLoaded(),
      otherOwnerUnchanged: true,
    };
    console.log("Native Plant Quick Log photo observation: " + JSON.stringify(observation));
    expect.soft(photoSurvivedUncertain).toBe(true);
    expect.soft(originalPhotoReadable).toBe(true);
    if (recovered.data)
      expect.soft(Buffer.from(await recovered.data.arrayBuffer())).toEqual(imageBytes);
    expect.soft(observation.uploads).toBe(1);
    expect.soft(observation.deletes).toBe(0);
    expect.soft(observation.referencesAgree).toBe(true);
    expect.soft(observation.distinctKeys).toBe(1);
    expect.soft(observation.receiptReused).toBe(true);
  } finally {
    await page.close();
    try {
      await removeFixturePhotos(f, uploadedPaths);
    } finally {
      await f.cleanup();
    }
  }
});
