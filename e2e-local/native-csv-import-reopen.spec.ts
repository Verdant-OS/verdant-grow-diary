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
// injected session, hosted backend, or claim about rows outside the Free window.
function recentCsv() {
  const minute = Math.floor(Date.now() / 60_000) * 60_000;
  const observations = [
    {
      at: new Date(minute - 120_000).toISOString(),
      temperature_c: 24,
      humidity_pct: 52,
      vpd_kpa: 1.11,
    },
    {
      at: new Date(minute - 60_000).toISOString(),
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

async function preview(page: Page, f: LocalFixture, scope: Scope, csv: Csv) {
  await page.goto(f.env.ui + "/sensors?tentId=" + scope.tentId + "&tentIntent=required#csv-import");
  await page.getByTestId("sensors-csv-import-button").click();
  await page.getByTestId("csv-import-file-input").setInputFiles({
    name: "native-recent-environment.csv",
    mimeType: "text/csv",
    buffer: csv.buffer,
  });
  await expect(page.getByTestId("csv-import-preview")).toBeVisible();
  await expect(page.getByTestId("csv-import-valid-count")).toHaveText("2");
  await expect(page.getByTestId("csv-import-skipped-count")).toHaveText("0");
  await expect(page.getByTestId("csv-import-confirm")).toBeEnabled();
}

function assertCsvRows(rows: OwnerRows, f: LocalFixture, scope: Scope, csv: Csv) {
  const imported = rows.sensor_readings.filter((r) => r.tent_id === scope.tentId);
  expect(imported).toHaveLength(6);
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
