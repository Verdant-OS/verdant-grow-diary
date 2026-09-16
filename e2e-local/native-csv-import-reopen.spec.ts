import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
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
  type OwnerRows,
  type Row,
  type Scope,
} from "./lib/nativeLocalFixtures";

// Actual browser import + PostgREST + disposable PostgreSQL. No mocked save,
// injected session, hosted backend, or published-site acceptance claim.
function recentCsv(agesInMinutes: readonly [number, number] = [2, 1]) {
  const minute = Math.floor(Date.now() / 60_000) * 60_000;
  const observations = [
    {
      at: new Date(minute - agesInMinutes[0] * 60_000).toISOString(),
      temperature_c: 24,
      humidity_pct: 52,
      vpd_kpa: 1.11,
    },
    {
      at: new Date(minute - agesInMinutes[1] * 60_000).toISOString(),
      temperature_c: 25,
      humidity_pct: 57,
      vpd_kpa: 1.23,
    },
  ];
  return {
    observations,
    buffer: Buffer.from(
      "Timestamp,Temp(°C),RH,VPD\n" +
        observations
          .map((r) => `${r.at},${r.temperature_c},${r.humidity_pct},${r.vpd_kpa}\n`)
          .join(""),
    ),
  };
}
type Csv = ReturnType<typeof recentCsv>;

function largeCsv(): Csv {
  const minute = Math.floor(Date.now() / 60_000) * 60_000;
  const observations = Array.from({ length: 450 }, (_, index) => ({
    at: new Date(minute - (450 - index) * 60_000).toISOString(),
    temperature_c: 24 + (index % 2),
    humidity_pct: 52 + (index % 6),
    vpd_kpa: 1.23,
  }));
  return {
    observations,
    buffer: Buffer.from(
      "Timestamp,Temp(°C),RH,VPD\n" +
        observations
          .map((r) => `${r.at},${r.temperature_c},${r.humidity_pct},${r.vpd_kpa}\n`)
          .join(""),
    ),
  };
}

// The normal fixture read is subject to PostgREST's 1,000-row response cap.
// Paginate with the same authenticated owner to verify every large-import row.
async function allCsvRows(f: LocalFixture, scope: Scope): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; offset < 2_000; offset += 500) {
    const { data, error } = await f.owner.client
      .from("sensor_readings")
      .select("*")
      .eq("tent_id", scope.tentId)
      .eq("source", "csv")
      .order("id")
      .range(offset, offset + 499);
    expect(error).toBeNull();
    if (!Array.isArray(data) || !data.every(isRow))
      throw new Error("Unexpected authenticated CSV readback.");
    rows.push(...data);
    if (data.length < 500) return rows;
  }
  throw new Error("CSV fixture exceeded its bounded readback.");
}

async function preview(page: Page, f: LocalFixture, scope: Scope, csv: Csv) {
  await page.goto(f.env.ui + "/sensors?tentId=" + scope.tentId + "&tentIntent=required#csv-import");
  await page.getByTestId("sensors-csv-import-button").click();
  await uploadCsv(page, csv);
}

async function uploadCsv(page: Page, csv: Csv) {
  await page.getByTestId("csv-import-file-input").setInputFiles({
    name: "native-environment.csv",
    mimeType: "text/csv",
    buffer: csv.buffer,
  });
  await expect(page.getByTestId("csv-import-preview")).toBeVisible();
  await expect(page.getByTestId("csv-import-valid-count")).toHaveText(
    String(csv.observations.length),
  );
  await expect(page.getByTestId("csv-import-skipped-count")).toHaveText("0");
  await expect(page.getByTestId("csv-import-confirm")).toBeEnabled();
}

async function signOutThroughUi(page: Page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const dialog = page.getByTestId("sign-out-confirm-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByTestId("header-quick-log-trigger")).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
}

// Use the existing document after the import starts. A hard navigation would
// discard the delayed callback instead of challenging its lifecycle guard.
async function signInCurrentDocument(page: Page, f: LocalFixture) {
  try {
    await page.locator("#signin-email").fill(f.owner.email);
    await page.locator("#signin-password").fill(f.owner.password);
    await page
      .getByRole("button", { name: /sign in|log in|continue/i })
      .first()
      .click();
    await page.waitForURL((url) => url.origin === f.env.ui && url.pathname !== "/auth");
    await page.getByTestId("agreement-reconsent-gate").waitFor({ state: "hidden" });
    await page.getByTestId("header-quick-log-trigger").waitFor({ state: "visible" });
  } catch {
    throw new Error("Real local UI sign-in did not restore the existing document.");
  }
}

for (const heldAt of ["duplicate lookup", "first committed batch"] as const) {
  test(`an account round trip ends a CSV import held at its ${heldAt}`, async ({
    page,
    context,
  }) => {
    const f = await createLocalFixture();
    const control = await context.newPage();
    let releaseReply!: () => void;
    const replyGate = new Promise<void>((resolve) => {
      releaseReply = resolve;
    });
    try {
      await fenceBrowser(context, f.env);
      // Accept each disposable account's real local agreement once before the
      // race. Later sign-ins must reuse those stored receipts, not inject auth.
      const otherFixture = { ...f, owner: f.other, primary: f.foreign };
      await signIn(page, otherFixture);
      await signOutThroughUi(page);
      await signIn(page, f);
      // Sessions use tab-local storage. Sign in explicitly in both tabs;
      // cross-tab sign-in is intentionally not an authentication mechanism.
      await signIn(control, f, false);
      const before = await ownerRows(f.owner);
      const otherBefore = fingerprint(await witnessRows(f));
      const csv = largeCsv();
      await preview(page, f, f.primary, csv);
      const importDocument = await page.evaluate(() => performance.timeOrigin);
      const writes: Row[][] = [];
      let held = false;
      let delivered = false;
      await context.route(f.env.api + "/rest/v1/sensor_readings*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const isInsert = request.method() === "POST";
        const isLookup =
          request.method() === "GET" &&
          url.searchParams.get("select")?.split(",").sort().join(",") ===
            "captured_at,metric,source,tent_id" &&
          url.searchParams.get("tent_id") === "in.(" + f.primary.tentId + ")";
        if (!isInsert && !isLookup) return route.fallback();
        if (isInsert) {
          const payload: unknown = request.postDataJSON();
          if (!Array.isArray(payload) || !payload.every(isRow))
            throw new Error("Unexpected local CSV payload.");
          writes.push(payload);
        }
        // Execute the actual authenticated request before delaying its reply.
        const response = await route.fetch({ maxRedirects: 0 });
        if (new URL(response.url()).origin !== f.env.api || !response.ok())
          throw new Error("Local CSV race request did not succeed.");
        if (!held && (heldAt === "duplicate lookup" ? isLookup : isInsert)) {
          held = true;
          await replyGate;
          await route.fulfill({ response });
          delivered = true;
        } else {
          await route.fulfill({ response });
        }
      });
      await page.getByTestId("csv-import-confirm").click();
      await expect.poll(() => held).toBe(true);
      const priorWriteCount = heldAt === "first committed batch" ? 1 : 0;
      const priorRowCount = heldAt === "first committed batch" ? 500 : 0;
      expect(writes).toHaveLength(priorWriteCount);
      if (priorWriteCount) expect(writes[0]).toHaveLength(500);
      const committed = await allCsvRows(f, f.primary);
      expect(committed).toHaveLength(priorRowCount);
      for (const row of committed) {
        expect(row).toMatchObject({
          user_id: f.owner.id,
          tent_id: f.primary.tentId,
          source: "csv",
        });
      }
      const committedFingerprint = fingerprint({ ...before, sensor_readings: committed });

      // The control tab supplies a real sign-out while the import modal is
      // busy. All subsequent account changes use the original tab's real UI
      // and SPA navigation, leaving its delayed callback alive.
      await signOutThroughUi(control);
      await expect(page.getByTestId("csv-import-modal")).toHaveCount(0);
      await signInCurrentDocument(page, otherFixture);
      await page.getByRole("link", { name: "Sensors", exact: true }).first().click();
      await expect(
        page.getByRole("button", { name: f.foreign.tentName, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: f.primary.tentName, exact: true })).toHaveCount(
        0,
      );
      await expect(page.getByTestId("csv-import-preview")).toHaveCount(0);
      await expect(page.getByTestId("csv-import-done")).toHaveCount(0);
      await assertIsolation(f, before, otherBefore);
      await signOutThroughUi(page);
      await page.getByTestId("landing-signin-cta-header").click();
      await signInCurrentDocument(page, f);
      await page.getByRole("link", { name: "Sensors", exact: true }).first().click();
      await page.getByRole("button", { name: f.secondary.tentName, exact: true }).click();
      await page.getByTestId("sensors-csv-import-button").click();
      await expect(page.getByTestId("csv-import-entry")).toBeVisible();
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(importDocument);

      releaseReply();
      await expect.poll(() => delivered).toBe(true);
      // A new successful import is a positive progress witness after the late
      // reply. The old operation must neither continue nor replace this UI.
      await expect(page.getByTestId("csv-import-entry")).toBeVisible();
      const freshCsv = recentCsv([700, 699]);
      await uploadCsv(page, freshCsv);
      await page.getByTestId("csv-import-confirm").click();
      await expect(page.getByTestId("csv-import-done")).toContainText("Imported 6 CSV reading(s).");
      expect(writes).toHaveLength(priorWriteCount + 1);
      expect(writes[priorWriteCount]).toHaveLength(6);
      expect(writes[priorWriteCount].every((row) => row.tent_id === f.secondary.tentId)).toBe(true);
      expect(fingerprint({ ...before, sensor_readings: await allCsvRows(f, f.primary) })).toBe(
        committedFingerprint,
      );
      assertCsvRows(await ownerRows(f.owner), f, f.secondary, freshCsv);
      await viewImportedHistory(page, f, f.secondary, freshCsv);
      expect(fingerprint({ ...before, sensor_readings: await allCsvRows(f, f.primary) })).toBe(
        committedFingerprint,
      );
      expect((await ownerRows(f.owner)).sensor_readings).toHaveLength(priorRowCount + 6);
      await assertIsolation(f, before, otherBefore);
      console.log("Native CSV account round trip:", heldAt, "retained rows:", priorRowCount);
    } finally {
      releaseReply();
      await page.close();
      await control.close();
      await f.cleanup();
    }
  });
}

function assertCsvRows(rows: OwnerRows, f: LocalFixture, scope: Scope, csv: Csv) {
  const imported = rows.sensor_readings.filter((r) => r.tent_id === scope.tentId);
  expect(imported).toHaveLength(csv.observations.length * 3);
  for (const observation of csv.observations) {
    for (const metric of ["temperature_c", "humidity_pct", "vpd_kpa"] as const) {
      const matches = imported.filter(
        (r) =>
          r.metric === metric && Date.parse(String(r.captured_at)) === Date.parse(observation.at),
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        user_id: f.owner.id,
        source: "csv",
        value: observation[metric],
        raw_payload: {
          source_tag: "csv",
          grow_id: scope.growId,
          tent_id: scope.tentId,
          plant_id: null,
          ...(metric === "vpd_kpa" ? { vpd_source: "csv" } : {}),
        },
      });
      // Observation time survives import instead of becoming the database clock.
      expect(Date.parse(String(matches[0].ts))).toBeGreaterThan(Date.parse(observation.at));
    }
  }
  return imported;
}

async function assertHistory(page: Page, csv: Csv) {
  const panel = page.getByTestId("imported-sensor-history-panel");
  await expect(panel.getByTestId("imported-history-total")).toHaveText("6");
  await expect(panel.getByTestId("imported-history-source-badge")).toHaveText("Source: CSV");
  await expect(panel.getByTestId("imported-history-not-live-badge")).toHaveText("Not live data");
  const table = panel.getByTestId("imported-history-recent-rows");
  await expect(table.locator("tbody tr")).toHaveCount(6);
  for (const observation of csv.observations) {
    const shownAt = await page.evaluate((at) => new Date(at).toLocaleString(), observation.at);
    for (const metric of ["temperature_c", "humidity_pct", "vpd_kpa"] as const) {
      const row = table
        .locator("tbody tr")
        .filter({ hasText: shownAt })
        .filter({ hasText: metric });
      await expect(row).toHaveCount(1);
      await expect(row.locator("td").nth(2)).toHaveText(String(observation[metric]));
    }
  }
}

async function viewImportedHistory(page: Page, f: LocalFixture, scope: Scope, csv: Csv) {
  await expect(page.getByTestId("csv-import-view-history")).toHaveAttribute(
    "href",
    "/tents/" + scope.tentId + "#imported-history",
  );
  await page.getByTestId("csv-import-view-history").click();
  await expect(page).toHaveURL(f.env.ui + "/tents/" + scope.tentId + "#imported-history");
  await assertHistory(page, csv);
  await page.reload();
  await assertHistory(page, csv);
}

async function assertIsolation(f: LocalFixture, baseline: OwnerRows, otherBefore: string) {
  const current = await ownerRows(f.owner);
  for (const table of ["grow_events", "diary_entries", "environment_events"] as const) {
    expect(current[table]).toEqual(baseline[table]);
  }
  const { data, error } = await f.other.client
    .from("sensor_readings")
    .select("id")
    .in("tent_id", [f.primary.tentId, f.secondary.tentId]);
  expect(error).toBeNull();
  expect(data).toEqual([]);
  // Positive authenticated witness makes an unchanged other-owner result meaningful.
  expect(fingerprint(await witnessRows(f))).toBe(otherBefore);
}

for (const scenario of [
  { name: "all old", ages: [121 * 24 * 60, 120 * 24 * 60], outside: 2, visible: 0 },
  { name: "mixed old and recent", ages: [120 * 24 * 60, 1], outside: 1, visible: 3 },
] as const) {
  test(`CSV ${scenario.name} observations persist across the Free history window and canonical live access changes`, async ({
    page,
    context,
  }) => {
    const f = await createLocalFixture();
    try {
      await fenceBrowser(context, f.env);
      const before = await ownerRows(f.owner);
      const csv = recentCsv(scenario.ages);
      // Positive old-row visibility for the other owner prevents the history cap
      // from masking a broken ownership policy in the negative-scope assertion.
      await f.setHistoryAccess("live", "other");
      const foreignWitness = {
        user_id: f.other.id,
        tent_id: f.foreign.tentId,
        source: "csv",
        metric: "temperature_c",
        value: 27,
        captured_at: csv.observations[0].at,
      };
      const seeded = await f.other.client.from("sensor_readings").insert(foreignWitness);
      expect(seeded.error).toBeNull();
      const witness = await witnessRows(f);
      expect(witness.sensor_readings).toHaveLength(1);
      expect(witness.sensor_readings[0]).toMatchObject({
        user_id: f.other.id,
        tent_id: f.foreign.tentId,
        source: "csv",
        metric: "temperature_c",
        value: 27,
      });
      expect(Date.parse(String(witness.sensor_readings[0].captured_at))).toBe(
        Date.parse(csv.observations[0].at),
      );
      const otherBefore = fingerprint(witness);
      const csvPosts: Row[][] = [];
      await context.route(f.env.api + "/rest/v1/sensor_readings*", async (route) => {
        if (route.request().method() === "POST") {
          const payload: unknown = route.request().postDataJSON();
          if (!Array.isArray(payload) || !payload.every(isRow))
            throw new Error("Unexpected CSV insert payload.");
          csvPosts.push(payload);
        }
        // Every save and read uses actual PostgREST; no fabricated responses.
        await route.fallback();
      });
      await signIn(page, f);
      await preview(page, f, f.primary, csv);
      await expect(page.getByTestId("csv-import-history-window")).toContainText("last 90 days");
      await expect(page.getByTestId("csv-import-outside-window")).toContainText(
        `${scenario.outside} of 2 observations fall outside this history window.`,
      );
      expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(before));
      await page.getByTestId("csv-import-confirm").click();
      await expect(page.getByTestId("csv-import-done")).toContainText("Imported 6 CSV reading(s).");
      expect(csvPosts).toHaveLength(1);
      expect(csvPosts[0]).toHaveLength(6);

      const assertRestrictedHistory = async () => {
        const rows = await ownerRows(f.owner);
        expect(rows.sensor_readings).toHaveLength(scenario.visible);
        for (const row of rows.sensor_readings) {
          expect(row).toMatchObject({
            user_id: f.owner.id,
            tent_id: f.primary.tentId,
            source: "csv",
          });
          expect(Date.parse(String(row.captured_at))).toBe(Date.parse(csv.observations[1].at));
        }
        const panel = page.getByTestId("imported-sensor-history-panel");
        await expect(panel.getByTestId("imported-history-window")).toContainText("last 90 days");
        await expect(panel.getByTestId("imported-history-window")).toContainText(
          "Older readings can be saved but won't appear",
        );
        if (scenario.visible === 0) {
          await expect(panel.getByTestId("imported-history-empty")).toBeVisible();
          await expect(panel.getByTestId("imported-history-recent-rows")).toHaveCount(0);
        } else {
          await expect(panel.getByTestId("imported-history-total")).toHaveText("3");
          await expect(panel.getByTestId("imported-history-empty")).toHaveCount(0);
          await expect(panel.locator("tbody tr")).toHaveCount(3);
        }
      };
      await page.getByTestId("csv-import-view-history").click();
      await expect(page).toHaveURL(f.env.ui + "/tents/" + f.primary.tentId + "#imported-history");
      await assertRestrictedHistory();
      await page.reload();
      await assertRestrictedHistory();

      // Hidden rows cannot be confirmed by a client dedupe read. Exercise that
      // boundary without blessing a generic retry loop as the desired UX: both
      // an honest retryable failure and a proven duplicate-only result are safe.
      await preview(page, f, f.primary, csv);
      const observeHiddenRetry = async () => {
        const terminal = page.locator(
          '[data-testid="csv-import-done"], [data-testid="csv-import-error"]',
        );
        await expect(terminal).toHaveCount(1);
        if ((await terminal.getAttribute("data-testid")) === "csv-import-done") {
          await expect(terminal).toContainText("No new readings imported.");
          return "duplicate-only";
        }
        await expect(terminal).toContainText("No CSV readings were saved.");
        await expect(page.getByTestId("csv-import-retry")).toBeEnabled();
        return "retryable-error";
      };
      await page.getByTestId("csv-import-confirm").click();
      const firstOutcome = await observeHiddenRetry();
      let retryOutcome = firstOutcome;
      if (firstOutcome === "retryable-error") {
        await page.getByTestId("csv-import-retry").click();
        retryOutcome = await observeHiddenRetry();
      }
      // Safe diagnostic enums only; no session, row, or account data is logged.
      console.log("Hidden CSV re-import:", scenario.name, firstOutcome, retryOutcome);
      const postsAfterHiddenRetry = csvPosts.length;
      await page.goto(f.env.ui + "/tents/" + f.primary.tentId + "#imported-history");
      await assertRestrictedHistory();

      // A sandbox subscription cannot unlock the database's live-only history policy.
      await f.setHistoryAccess("sandbox");
      await page.reload();
      await assertRestrictedHistory();

      // Test setup changes canonical access, not the readings. Assertions still use
      // the grower's authenticated JWT; never privileged readback or a fake UI tier.
      await f.setHistoryAccess("live");
      const full = await ownerRows(f.owner);
      assertCsvRows(full, f, f.primary, csv);
      expect(full.sensor_readings).toHaveLength(6);
      await page.reload();
      await expect(page.getByTestId("imported-history-window")).toContainText("no plan time limit");
      await assertHistory(page, csv);
      await page.reload();
      await assertHistory(page, csv);

      // The exact same file is now visible to dedupe; retrying is a read-only no-op.
      await preview(page, f, f.primary, csv);
      await expect(page.getByTestId("csv-import-outside-window")).toHaveCount(0);
      await page.getByTestId("csv-import-confirm").click();
      await expect(page.getByTestId("csv-import-done")).toContainText("No new readings imported.");
      expect(csvPosts).toHaveLength(postsAfterHiddenRetry);
      expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(full));
      await viewImportedHistory(page, f, f.primary, csv);

      await f.setHistoryAccess(null);
      await page.reload();
      await assertRestrictedHistory();
      await f.setHistoryAccess("live");
      expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(full));
      await page.goto(f.env.ui + "/tents/" + f.secondary.tentId + "#imported-history");
      await expect(page.getByTestId("imported-history-empty")).toBeVisible();
      await page.goto(f.env.ui + "/tents/" + f.primary.tentId + "#imported-history");
      await assertHistory(page, csv);
      expect(csvPosts).toHaveLength(postsAfterHiddenRetry);
      await assertIsolation(f, before, otherBefore);
    } finally {
      await page.close();
      await f.cleanup();
    }
  });
}

test("CSV preview is read-only; confirmed import survives reopening with exact tent, time and CSV VPD provenance", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    // Existing plant diary fixture, saved by its authenticated owner. The CSV
    // operation must enrich its read-only context without editing the diary.
    const note = await f.owner.client.rpc("quicklog_save_manual", {
      p_target_type: "plant",
      p_target_id: f.primary.plantId,
      p_action: "note",
      p_note: "Native CSV context witness",
      p_idempotency_key: randomUUID(),
    });
    expect(note.error).toBeNull();
    acceptedReceipt(note.data);
    const before = await ownerRows(f.owner);
    expect(before.diary_entries).toHaveLength(1);
    const otherBefore = fingerprint(await witnessRows(f));
    const csv = recentCsv();
    await signIn(page, f);
    await preview(page, f, f.primary, csv);
    expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(before));
    await page.getByTestId("csv-import-cancel").click();
    await expect(page.getByTestId("csv-import-modal")).toHaveCount(0);
    expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(before));

    for (const scope of [f.primary, f.secondary]) {
      // The same file is new in each tent: dedupe must include target scope.
      await page.goto(f.env.ui + "/tents/" + scope.tentId + "#imported-history");
      await expect(page.getByTestId("imported-history-empty")).toBeVisible();
      await preview(page, f, scope, csv);
      await page.getByTestId("csv-import-confirm").click();
      await expect(page.getByTestId("csv-import-done")).toContainText("Imported 6 CSV reading(s).");
      assertCsvRows(await ownerRows(f.owner), f, scope, csv);
      await viewImportedHistory(page, f, scope, csv);
    }
    const persisted = await ownerRows(f.owner);
    expect(persisted.sensor_readings).toHaveLength(12);
    assertCsvRows(persisted, f, f.primary, csv);
    assertCsvRows(persisted, f, f.secondary, csv);
    await page.goto(
      f.env.ui +
        "/timeline?growId=" +
        f.primary.growId +
        "&tentId=" +
        f.primary.tentId +
        "&plantId=" +
        f.primary.plantId,
    );
    const chip = page.getByTestId("csv-timeline-chip-" + String(before.diary_entries[0].id));
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute("data-source", "CSV");
    await expect(chip).toContainText("CSV VPD: 1.23 kPa");
    await expect(chip).not.toContainText("Derived VPD");
    await page.reload();
    await expect(chip).toContainText("CSV VPD: 1.23 kPa");
    expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(persisted));
    await assertIsolation(f, before, otherBefore);
  } finally {
    await page.close();
    await f.cleanup();
  }
});

test("a committed CSV import with a lost reply remains unconfirmed until explicit retry reconciles without duplicate writes", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    const before = await ownerRows(f.owner);
    const otherBefore = fingerprint(await witnessRows(f));
    const csv = recentCsv();
    const writes: Row[][] = [];
    let accepted = 0;
    await context.route(f.env.api + "/rest/v1/sensor_readings*", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const payload: unknown = route.request().postDataJSON();
      if (!Array.isArray(payload) || !payload.every(isRow))
        throw new Error("Unexpected CSV insert payload.");
      writes.push(payload);
      const response = await route.fetch({ maxRedirects: 0 });
      if (new URL(response.url()).origin !== f.env.api || !response.ok()) {
        await route.fulfill({ response });
        return;
      }
      accepted += 1;
      if (accepted === 1)
        await route.abort("failed"); // Real commit, then lost acknowledgement.
      else await route.fulfill({ response });
    });
    await signIn(page, f);
    await preview(page, f, f.primary, csv);
    await page.getByTestId("csv-import-confirm").click();
    const error = page.getByTestId("csv-import-error");
    await expect(error).toContainText("We couldn't confirm whether any CSV readings were saved.");
    await expect(error).not.toContainText("No CSV readings were saved.");
    await expect(page.getByTestId("csv-import-done")).toHaveCount(0);
    await expect(page.getByTestId("csv-import-retry")).toBeEnabled();
    expect(accepted).toBe(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toHaveLength(6);
    const committed = await ownerRows(f.owner);
    assertCsvRows(committed, f, f.primary, csv);
    expect(committed.sensor_readings).toHaveLength(6);

    await page.getByTestId("csv-import-retry").click();
    await expect(page.getByTestId("csv-import-done")).toContainText(
      "No new readings imported. These readings already exist in Verdant.",
    );
    expect(writes).toHaveLength(1);
    expect(accepted).toBe(1);
    expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(committed));
    await viewImportedHistory(page, f, f.primary, csv);
    await page.goto(f.env.ui + "/tents/" + f.secondary.tentId + "#imported-history");
    await expect(page.getByTestId("imported-history-empty")).toBeVisible();
    await page.goto(f.env.ui + "/tents/" + f.primary.tentId + "#imported-history");
    await assertHistory(page, csv);
    expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(committed));
    await assertIsolation(f, before, otherBefore);
  } finally {
    await page.close();
    await f.cleanup();
  }
});

test("a multi-batch CSV import reconciles a lost final reply beyond the read cap without duplicate writes", async ({
  page,
  context,
}) => {
  const f = await createLocalFixture();
  try {
    await fenceBrowser(context, f.env);
    const before = await ownerRows(f.owner);
    const otherBefore = fingerprint(await witnessRows(f));
    const csv = largeCsv();
    const writes: number[] = [];
    let accepted = 0;
    await context.route(f.env.api + "/rest/v1/sensor_readings*", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const payload: unknown = route.request().postDataJSON();
      if (!Array.isArray(payload) || !payload.every(isRow))
        throw new Error("Unexpected CSV insert payload.");
      writes.push(payload.length);
      const response = await route.fetch({ maxRedirects: 0 });
      if (new URL(response.url()).origin !== f.env.api)
        throw new Error("CSV insert escaped the local backend.");
      if (!response.ok()) return route.fulfill({ response });
      accepted += 1;
      // A real 500 + 500 + 350 commit; only the last acknowledgement is lost.
      if (accepted === 3) await route.abort("failed");
      else await route.fulfill({ response });
    });
    await signIn(page, f);
    await preview(page, f, f.primary, csv);
    expect(await allCsvRows(f, f.primary)).toEqual([]);
    await page.getByTestId("csv-import-confirm").click();
    const error = page.getByTestId("csv-import-error");
    await expect(error).toContainText("1000 CSV readings confirmed saved.");
    await expect(error).toContainText(
      "We couldn't confirm whether the remaining CSV readings were saved.",
    );
    await expect(error).not.toContainText("No CSV readings were saved.");
    await expect(page.getByTestId("csv-import-done")).toHaveCount(0);
    await expect(page.getByTestId("csv-import-retry")).toBeEnabled();
    expect(writes).toEqual([500, 500, 350]);
    expect(accepted).toBe(3);
    const committed = await allCsvRows(f, f.primary);
    assertCsvRows({ ...before, sensor_readings: committed }, f, f.primary, csv);
    expect(committed).toHaveLength(1_350);
    expect((await ownerRows(f.owner)).sensor_readings).toHaveLength(1_000);
    const committedFingerprint = fingerprint({ ...before, sensor_readings: committed });

    await page.getByTestId("csv-import-retry").click();
    await expect(page.getByTestId("csv-import-done")).toContainText(
      "No new readings imported. These readings already exist in Verdant.",
    );
    // A rejected duplicate POST may be needed after the capped preflight query;
    // only confirmed commits and complete authenticated readback prove safety.
    expect(accepted).toBe(3);
    expect(fingerprint({ ...before, sensor_readings: await allCsvRows(f, f.primary) })).toBe(
      committedFingerprint,
    );
    await expect(page.getByTestId("csv-import-view-history")).toHaveAttribute(
      "href",
      "/tents/" + f.primary.tentId + "#imported-history",
    );
    await page.getByTestId("csv-import-view-history").click();
    const assertBoundedHistory = async () => {
      const panel = page.getByTestId("imported-sensor-history-panel");
      await expect(panel.getByTestId("imported-history-total")).toHaveText("200");
      await expect(panel.getByTestId("imported-history-query-limit")).toContainText(
        "newest 200 available CSV readings by observation time",
      );
      await expect(panel.getByTestId("imported-history-query-limit")).toContainText(
        "not all readings ever saved",
      );
      await expect(panel.getByTestId("imported-history-source-badge")).toHaveText("Source: CSV");
      await expect(panel.getByTestId("imported-history-not-live-badge")).toHaveText(
        "Not live data",
      );
      const latest = csv.observations[csv.observations.length - 1];
      const shownAt = await page.evaluate((at) => new Date(at).toLocaleString(), latest.at);
      for (const metric of ["temperature_c", "humidity_pct", "vpd_kpa"] as const) {
        const row = panel
          .getByTestId("imported-history-recent-rows")
          .locator("tbody tr")
          .filter({ hasText: shownAt })
          .filter({ hasText: metric });
        await expect(row).toHaveCount(1);
        await expect(row.locator("td").nth(2)).toHaveText(String(latest[metric]));
      }
    };
    await assertBoundedHistory();
    await page.reload();
    await assertBoundedHistory();
    await page.goto(f.env.ui + "/tents/" + f.secondary.tentId + "#imported-history");
    await expect(page.getByTestId("imported-history-empty")).toBeVisible();
    expect(await allCsvRows(f, f.secondary)).toEqual([]);
    expect(fingerprint({ ...before, sensor_readings: await allCsvRows(f, f.primary) })).toBe(
      committedFingerprint,
    );
    expect(accepted).toBe(3);
    await assertIsolation(f, before, otherBefore);
  } finally {
    await page.close();
    await f.cleanup();
  }
});
