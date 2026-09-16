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
  witnessRows,
  type LocalFixture,
  type Row,
} from "./lib/nativeLocalFixtures";

async function createNoteThroughBrowser(
  page: Page,
  f: LocalFixture,
  note: string,
): Promise<string> {
  await signIn(page, f);
  await page.goto(f.env.ui + "/plants/" + f.primary.plantId + "?tentId=" + f.primary.tentId);
  await page.getByTestId("header-quick-log-trigger").click();
  await page.locator("#qlv2-target").click();
  await page
    .getByTestId("qlv2-target-content")
    .getByRole("option", {
      name: "Plant · " + f.primary.plantName,
      exact: true,
    })
    .click();
  await page.locator("#qlv2-note").fill(note);
  const reply = page.waitForResponse(
    (response) =>
      response.url() === f.env.api + "/rest/v1/rpc/quicklog_save_manual" &&
      response.request().method() === "POST",
  );
  await page.getByTestId("qlv2-save").click();
  const response = await reply;
  expect(response.ok()).toBe(true);
  const receipt = acceptedReceipt(await response.json());
  await expect(page.getByTestId("qlv2-post-save")).toBeVisible();
  await page.getByTestId("quick-log-post-save-view").click();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/timeline" && url.searchParams.get("plantId") === f.primary.plantId,
  );
  await expect(recentRow(page, note)).toHaveCount(1);
  return receipt.grow_event_id;
}

function recentRow(page: Page, note: string) {
  return page
    .getByTestId("quicklog-history-section-recent")
    .getByTestId("quicklog-history-row")
    .filter({ hasText: note });
}

async function revisions(f: LocalFixture, rootId: string, other = false): Promise<Row[]> {
  const account = other ? f.other : f.owner;
  const { data, error } = await account.client
    .from("quicklog_entry_revisions")
    .select("*")
    .eq("root_id", rootId)
    .order("revision_no", { ascending: true });
  if (
    error ||
    !Array.isArray(data) ||
    data.some((row) => !isRow(row) || row.user_id !== account.id)
  ) {
    throw new Error("Authenticated revision ledger read failed its owner boundary.");
  }
  return data;
}

async function loseFirstCommittedReply(page: Page, f: LocalFixture, rpc: string) {
  const calls: Row[] = [];
  const replies: Row[] = [];
  await page.route(f.env.api + "/rest/v1/rpc/" + rpc, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const payload: unknown = route.request().postDataJSON();
    if (!isRow(payload)) throw new Error("Malformed revision payload.");
    calls.push(payload);
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.ok()).toBe(true);
    const reply: unknown = await response.json();
    if (!isRow(reply)) throw new Error("Malformed real revision receipt.");
    replies.push(reply);
    if (calls.length === 1) {
      expect(reply.ok).toBe(true);
      expect(typeof reply.revision_id).toBe("string");
      expect(reply.revision_no).toBe(1);
      return route.abort("connectionreset");
    }
    return route.fulfill({ response });
  });
  return { calls, replies };
}

test("a committed correction with a lost reply recovers without a second logical revision", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    const otherBefore = fingerprint(await witnessRows(f));
    const original = "Native original correction note " + randomUUID();
    const corrected = "Native corrected note " + randomUUID();
    const id = await createNoteThroughBrowser(page, f, original);
    const trace = await loseFirstCommittedReply(page, f, "quicklog_correct_entry");
    await recentRow(page, original).getByTestId("quicklog-entry-correct-button").click();
    await page.getByTestId("quicklog-correct-reason-typo").click();
    await page.getByTestId("quicklog-correct-note-input").fill(corrected);
    await page.getByTestId("quicklog-correct-save").click();
    await expect.poll(() => trace.replies.length).toBe(1);
    await expect
      .poll(async () =>
        (await page.getByTestId("quicklog-entry-correct-dialog").isVisible())
          ? page.getByTestId("quicklog-correct-save").isEnabled()
          : true,
      )
      .toBe(true);
    const first = await revisions(f, id);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: "correction", reason_code: "typo", revision_no: 1 });
    expect(first[0].previous_state).toMatchObject({ note: original });
    expect(first[0].new_state).toMatchObject({ note: corrected });
    const afterLostReply = await ownerRows(f.owner);
    expect(afterLostReply.grow_events.find((row) => row.id === id)).toMatchObject({
      note: corrected,
      plant_id: f.primary.plantId,
      tent_id: f.primary.tentId,
      grow_id: f.primary.growId,
      source: "manual",
    });
    const falseFailureCopy = await page
      .getByText("The change could not be saved. Try again.", { exact: true })
      .isVisible();
    if (await page.getByTestId("quicklog-entry-correct-dialog").isVisible()) {
      await page.getByTestId("quicklog-correct-save").click();
    }
    await expect(page.getByTestId("quicklog-entry-correct-dialog")).not.toBeVisible();
    const final = await revisions(f, id);
    const finalRows = await ownerRows(f.owner);
    expect(finalRows.grow_events).toHaveLength(1);
    expect(finalRows.diary_entries).toHaveLength(1);
    expect(finalRows.diary_entries[0]).toMatchObject({
      note: corrected,
      plant_id: f.primary.plantId,
    });
    expect(finalRows.sensor_readings).toEqual(afterLostReply.sensor_readings);
    expect(finalRows.environment_events).toEqual(afterLostReply.environment_events);
    await page.reload();
    await expect(recentRow(page, corrected)).toHaveCount(1);
    const editedTitle = await recentRow(page, corrected)
      .getByTestId("quicklog-entry-edited-badge")
      .getAttribute("title");
    expect(await revisions(f, id, true)).toEqual([]);
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);
    console.log(
      "Native correction retry observation: " +
        JSON.stringify({
          firstRevisions: first.length,
          finalRevisions: final.length,
          writes: trace.calls.length,
          falseFailureCopy,
          eventRows: finalRows.grow_events.length,
          diaryRows: finalRows.diary_entries.length,
          reopenedCorrectedNote: true,
          editedTitle,
          otherOwnerUnchanged: true,
        }),
    );
    expect.soft(final).toHaveLength(1);
    expect.soft(falseFailureCopy).toBe(false);
    expect
      .soft(editedTitle)
      .toBe("Corrected once. The original values are kept in the audit history.");
  } finally {
    await page.close();
    await f.cleanup();
  }
});

test("a committed retraction with a lost reply resolves on retry instead of leaving an active entry", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    const otherBefore = fingerprint(await witnessRows(f));
    const note = "Native retracted note " + randomUUID();
    const id = await createNoteThroughBrowser(page, f, note);
    const trace = await loseFirstCommittedReply(page, f, "quicklog_retract_entry");
    await recentRow(page, note).getByTestId("quicklog-entry-retract-button").click();
    await page.getByTestId("quicklog-retract-reason-accidental").click();
    await page.getByTestId("quicklog-retract-confirm").click();
    await expect.poll(() => trace.replies.length).toBe(1);
    await expect
      .poll(async () =>
        (await page.getByTestId("quicklog-entry-retract-dialog").isVisible())
          ? page.getByTestId("quicklog-retract-confirm").isEnabled()
          : true,
      )
      .toBe(true);
    const first = await revisions(f, id);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      kind: "retraction",
      reason_code: "accidental",
      revision_no: 1,
    });
    const saved = await ownerRows(f.owner);
    expect(saved.grow_events.find((row) => row.id === id)).toMatchObject({
      is_deleted: true,
      source: "manual",
    });
    expect(typeof saved.diary_entries[0].retracted_at).toBe("string");
    const falseFailureCopy = await page
      .getByText("The change could not be saved. Try again.", { exact: true })
      .isVisible();
    if (await page.getByTestId("quicklog-entry-retract-dialog").isVisible()) {
      await page.getByTestId("quicklog-retract-confirm").click();
      await expect.poll(() => trace.replies.length).toBe(2);
    }
    await expect.soft(page.getByTestId("quicklog-entry-retract-dialog")).not.toBeVisible();
    const dialogStillOpen = await page.getByTestId("quicklog-entry-retract-dialog").isVisible();
    const staleActiveRows = await recentRow(page, note).count();
    const final = await revisions(f, id);
    expect(final).toHaveLength(1);
    expect(await revisions(f, id, true)).toEqual([]);
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);
    await page.reload();
    await expect(recentRow(page, note)).toHaveCount(0);
    await page.getByTestId("quicklog-retracted-panel-toggle").click();
    await expect(page.getByTestId("quicklog-retracted-row").filter({ hasText: note })).toHaveCount(
      1,
    );
    console.log(
      "Native retraction retry observation: " +
        JSON.stringify({
          revisions: final.length,
          writes: trace.calls.length,
          secondReplyReason: trace.replies[1]?.reason ?? null,
          falseFailureCopy,
          dialogStillOpen,
          staleActiveRows,
          retainedAuditAfterReload: true,
          otherOwnerUnchanged: true,
        }),
    );
    expect.soft(falseFailureCopy).toBe(false);
    expect.soft(dialogStillOpen).toBe(false);
    expect.soft(staleActiveRows).toBe(0);
  } finally {
    await page.close();
    await f.cleanup();
  }
});
