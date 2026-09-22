import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";
import {
  buildSensorReadingInserts,
  persistCsvEnvironmentRows,
  type InsertClient,
} from "@/lib/environmentCsvImportPersistence";
import { dedupeKeyOf } from "@/lib/csv-import/sensorReadingsBatchInsert";
import { parseEnvironmentCSV } from "@/lib/csvParser";

const SCOPE = { user_id: "owner-A", grow_id: "grow-A", tent_id: "tent-A" };
const HISTORY_HREF = "/tents/tent-A#imported-sensor-history";
const CSV = "Timestamp,Temp(°C),RH\n2026-05-17T10:00:00Z,25,50\n2026-09-15T10:00:00Z,26,51\n";
const CONFLICT = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "sensor_readings_dedupe_uidx"',
  details: "Private driver detail must not be rendered",
};

afterEach(cleanup);

function file() {
  return new File([CSV], "history.csv", { type: "text/csv" });
}

async function rows() {
  return (await parseEnvironmentCSV(file())).validRows;
}

function keySet(inserts: ReturnType<typeof buildSensorReadingInserts>) {
  return new Set(inserts.map(dedupeKeyOf).filter((key): key is string => key !== null));
}

async function mountImport(client: InsertClient, chunkSize = 500) {
  const confirm = vi.fn((parsed: Readonly<Awaited<ReturnType<typeof rows>>>) =>
    persistCsvEnvironmentRows(parsed, SCOPE, client, chunkSize),
  );
  render(
    <MemoryRouter>
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={confirm}
        viewHistoryHref={HISTORY_HREF}
      />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByTestId("csv-import-file-input"), { target: { files: [file()] } });
  await screen.findByTestId("csv-import-preview");
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("csv-import-confirm"));
  return confirm;
}

async function errorText() {
  return (await screen.findByTestId("csv-import-error")).textContent ?? "";
}

function expectSafeConflict(text: string) {
  expect(text).toContain("Matching CSV history was detected");
  expect(text).toContain("couldn't verify all matching readings in your current history view");
  expect(text).toContain("Older readings may be outside that view");
  expect(text).toContain("retrying the same file may encounter the same conflict");
  expect(text).toContain("No live sensor data was created");
  expect(text).not.toMatch(/23505|sensor_readings_dedupe_uidx|Private driver|upgrade|90.day/i);
  expect(screen.queryByTestId("csv-import-done")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View imported history" })).toHaveAttribute(
    "href",
    HISTORY_HREF,
  );
}

describe("CSV conflicts outside the visible history view", () => {
  it.each([0, 3])(
    "explains an unresolved conflict with %i visible matches, including explicit retry",
    async (visibleCount) => {
      const inserts = buildSensorReadingInserts(await rows(), SCOPE);
      let visibleKeys = keySet(visibleCount === 0 ? [] : inserts.slice(-visibleCount));
      const insert = vi.fn(async () => ({ error: CONFLICT, insertedCount: 0 }));
      const client: InsertClient = {
        insertSensorReadings: insert,
        fetchExistingSensorReadingKeys: async () => visibleKeys,
      };
      const confirm = await mountImport(client);
      const first = await errorText();
      expectSafeConflict(first);
      expect(first).toContain("No new CSV readings were saved in this attempt");
      expect(confirm).toHaveBeenCalledTimes(1);
      const firstCalls = insert.mock.calls.length;
      fireEvent.click(screen.getByTestId("csv-import-retry"));
      expectSafeConflict(await errorText());
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(insert.mock.calls.length).toBeGreaterThan(firstCalls);
      const result = await confirm.mock.results[1].value;
      expect(result).toMatchObject({
        insertedCount: 0,
        duplicateCount: visibleCount,
        failureReason: "unverified_duplicate",
      });
      // A later authorized read can resolve the conflict; explicit Retry remains useful.
      visibleKeys = keySet(inserts);
      const callsBeforeVerifiedRead = insert.mock.calls.length;
      fireEvent.click(screen.getByTestId("csv-import-retry"));
      expect(await screen.findByTestId("csv-import-done")).toHaveTextContent(
        "These readings already exist in Verdant",
      );
      expect(insert).toHaveBeenCalledTimes(callsBeforeVerifiedRead);
    },
  );

  it("retains confirmed earlier batches when a later batch conflicts", async () => {
    let calls = 0;
    const confirm = await mountImport(
      {
        fetchExistingSensorReadingKeys: async () => new Set(),
        insertSensorReadings: async (batch) =>
          ++calls === 1
            ? { error: null, insertedCount: batch.length }
            : { error: CONFLICT, insertedCount: 0 },
      },
      3,
    );
    const text = await errorText();
    expectSafeConflict(text);
    expect(text).toContain("3 CSV readings confirmed saved");
    expect(text).not.toContain("No new CSV readings were saved");
    expect(await confirm.mock.results[0].value).toMatchObject({
      insertedCount: 3,
      partialWrite: true,
      failureReason: "unverified_duplicate",
    });
    fireEvent.click(screen.getByTestId("csv-import-retry"));
    const retryText = await errorText();
    expectSafeConflict(retryText);
    expect(retryText).toContain("3 CSV readings confirmed saved");
    expect(retryText).not.toContain("No new CSV readings were saved");
  });

  it("never converts a lost acknowledgement into zero writes when retry then conflicts", async () => {
    let first = true;
    await mountImport({
      fetchExistingSensorReadingKeys: async () => new Set(),
      insertSensorReadings: async () => {
        if (first) {
          first = false;
          throw new Error("response lost after a possible commit");
        }
        return { error: CONFLICT, insertedCount: 0 };
      },
    });
    expect(await errorText()).toContain("couldn't confirm whether any CSV readings were saved");
    fireEvent.click(screen.getByTestId("csv-import-retry"));
    const text = await errorText();
    expectSafeConflict(text);
    expect(text).toContain("couldn't confirm whether any CSV readings were saved");
    expect(text).not.toContain("No new CSV readings were saved");
  });

  it.each([
    { code: "23505", message: "some_other_index" },
    { code: "42501", message: CONFLICT.message },
  ])(
    "does not classify an unrelated rejection as hidden history: $code/$message",
    async (error) => {
      const confirm = await mountImport({
        insertSensorReadings: async () => ({ error, insertedCount: 0 }),
      });
      const text = await errorText();
      expect(text).toContain("No CSV readings were saved. Try again.");
      expect(text).not.toContain("Matching CSV history");
      expect(text).not.toContain(error.message);
      expect(await confirm.mock.results[0].value).not.toHaveProperty("failureReason");
    },
  );

  it("still reports visible duplicates as a confirmed no-op without an insert", async () => {
    const inserts = buildSensorReadingInserts(await rows(), SCOPE);
    const insert = vi.fn(async () => ({ error: null, insertedCount: 0 }));
    await mountImport({
      insertSensorReadings: insert,
      fetchExistingSensorReadingKeys: async () => keySet(inserts),
    });
    expect(await screen.findByTestId("csv-import-done")).toHaveTextContent(
      "These readings already exist in Verdant",
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("still recovers a duplicate race when the second read verifies every match", async () => {
    const inserts = buildSensorReadingInserts(await rows(), SCOPE);
    let reads = 0;
    const confirm = await mountImport({
      fetchExistingSensorReadingKeys: async () => (++reads === 1 ? new Set() : keySet(inserts)),
      insertSensorReadings: async () => ({ error: CONFLICT, insertedCount: 0 }),
    });
    await waitFor(() =>
      expect(screen.getByTestId("csv-import-done")).toHaveTextContent(
        "These readings already exist in Verdant",
      ),
    );
    expect(await confirm.mock.results[0].value).toMatchObject({
      insertedCount: 0,
      duplicateCount: 6,
      error: null,
    });
  });
});
