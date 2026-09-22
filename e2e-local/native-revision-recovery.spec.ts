import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
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
    await expect.soft(recentRow(page, note)).toHaveCount(0);
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

async function rpcReply(f: LocalFixture, rpc: string, args: Row, other = false): Promise<Row> {
  const { data, error } = await (other ? f.other : f.owner).client.rpc(rpc, args);
  if (error || !isRow(data))
    throw new Error("Real keyed revision RPC did not return a readable receipt.");
  return data;
}

test("concurrent keyed corrections replay once, reject changed payloads and permit distinct corrections", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    const otherBefore = fingerprint(await witnessRows(f));
    const id = await createNoteThroughBrowser(page, f, "Concurrent revision " + randomUUID());
    const args = {
      p_idempotency_key: "revision-" + randomUUID(),
      p_reason_code: "typo",
      p_grow_event_id: id,
      p_changes: { note: "First correction" },
    };
    const receipts = await Promise.all([
      rpcReply(f, "quicklog_correct_entry", args),
      rpcReply(f, "quicklog_correct_entry", args),
    ]);
    expect(receipts.every((r) => r.ok === true && r.revision_no === 1)).toBe(true);
    expect(receipts[0].revision_id).toBe(receipts[1].revision_id);
    expect(receipts.filter((r) => r.reused === true)).toHaveLength(1);
    expect(await revisions(f, id)).toHaveLength(1);
    expect(
      await rpcReply(f, "quicklog_correct_entry", {
        ...args,
        p_changes: { note: "Different payload" },
      }),
    ).toMatchObject({ ok: false, reason: "idempotency_conflict" });
    expect(
      await rpcReply(f, "quicklog_correct_entry", { ...args, p_grow_event_id: f.witnessId }),
    ).toMatchObject({ ok: false, reason: "idempotency_conflict" });
    const next = await rpcReply(f, "quicklog_correct_entry", {
      ...args,
      p_idempotency_key: "revision-" + randomUUID(),
      p_changes: { note: "Second intentional correction" },
    });
    expect(next).toMatchObject({ ok: true, revision_no: 2 });
    const ledger = await revisions(f, id);
    expect(ledger).toHaveLength(2);
    expect(ledger[1].previous_state).toMatchObject({ note: "First correction" });
    expect(ledger[1].new_state).toMatchObject({ note: "Second intentional correction" });
    expect(await rpcReply(f, "quicklog_correct_entry", args, true)).toMatchObject({
      ok: false,
      reason: "not_found_or_not_owned",
    });
    expect(await revisions(f, id, true)).toEqual([]);
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);
    console.log(
      "Native keyed correction: concurrency, payload/root binding, distinct correction and owner isolation PASS.",
    );
  } finally {
    await page.close();
    await f.cleanup();
  }
});

test("concurrent keyed retractions return the original receipt and bind operation kind and reason", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    const id = await createNoteThroughBrowser(page, f, "Concurrent retraction " + randomUUID());
    const args = {
      p_idempotency_key: "revision-" + randomUUID(),
      p_reason_code: "accidental",
      p_grow_event_id: id,
    };
    const receipts = await Promise.all([
      rpcReply(f, "quicklog_retract_entry", args),
      rpcReply(f, "quicklog_retract_entry", args),
    ]);
    expect(receipts.every((r) => r.ok === true && r.revision_no === 1)).toBe(true);
    expect(receipts[0].revision_id).toBe(receipts[1].revision_id);
    expect(receipts.filter((r) => r.reused === true)).toHaveLength(1);
    expect(await revisions(f, id)).toHaveLength(1);
    expect(
      await rpcReply(f, "quicklog_retract_entry", { ...args, p_reason_code: "duplicate" }),
    ).toMatchObject({ ok: false, reason: "idempotency_conflict" });
    expect(
      await rpcReply(f, "quicklog_correct_entry", {
        ...args,
        p_changes: { note: "Must not correct" },
      }),
    ).toMatchObject({ ok: false, reason: "idempotency_conflict" });
    expect((await ownerRows(f.owner)).grow_events.find((row) => row.id === id)).toMatchObject({
      is_deleted: true,
      source: "manual",
    });
    console.log(
      "Native keyed retraction: concurrency, exact receipt, operation/reason binding and retained audit PASS.",
    );
  } finally {
    await page.close();
    await f.cleanup();
  }
});

test("client roles cannot read or alter the receipt store or call its helper, and rejected writes do not reserve keys", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    const otherBefore = fingerprint(await witnessRows(f));
    const id = await createNoteThroughBrowser(page, f, "Revision permissions " + randomUUID());
    const args = {
      p_idempotency_key: "revision-" + randomUUID(),
      p_reason_code: "typo",
      p_grow_event_id: f.witnessId,
      p_changes: { note: "Owned change" },
    };
    expect(await rpcReply(f, "quicklog_correct_entry", args)).toMatchObject({
      ok: false,
      reason: "not_found_or_not_owned",
    });
    expect(
      await rpcReply(f, "quicklog_correct_entry", { ...args, p_grow_event_id: id }),
    ).toMatchObject({ ok: true, revision_no: 1 });
    const anonymous = createClient(f.env.api, f.env.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const account of [f.owner, f.other, { id: f.owner.id, client: anonymous }]) {
      const read = await account.client.from("quicklog_revision_idempotency").select("*");
      expect(read.error?.code).toBe("42501");
      const insert = await account.client.from("quicklog_revision_idempotency").insert({
        user_id: account.id,
        idempotency_key: "forged-key",
        request: {},
        receipt: { ok: true },
      });
      expect(insert.error?.code).toBe("42501");
      const update = await account.client
        .from("quicklog_revision_idempotency")
        .update({ receipt: { ok: true } })
        .eq("user_id", account.id);
      expect(update.error?.code).toBe("42501");
      const remove = await account.client
        .from("quicklog_revision_idempotency")
        .delete()
        .eq("user_id", account.id);
      expect(remove.error?.code).toBe("42501");
      const direct = await account.client.rpc("quicklog_revision_apply_once", {
        ...args,
        p_kind: "correction",
        p_diary_entry_id: null,
        p_reason_note: null,
      });
      expect(direct.error?.code).toBe("42501");
    }
    for (const rpc of ["quicklog_correct_entry", "quicklog_retract_entry"]) {
      const { error } = await anonymous.rpc(
        rpc,
        rpc === "quicklog_correct_entry"
          ? { ...args, p_grow_event_id: id }
          : {
              p_idempotency_key: args.p_idempotency_key,
              p_reason_code: "accidental",
              p_grow_event_id: id,
            },
      );
      expect(error?.code).toBe("42501");
    }
    expect(await revisions(f, id)).toHaveLength(1);
    expect(fingerprint(await witnessRows(f))).toBe(otherBefore);
    console.log(
      "Native revision permissions: client SELECT/INSERT/UPDATE/DELETE and internal helper denied; rejected key reusable PASS.",
    );
  } finally {
    await page.close();
    await f.cleanup();
  }
});
