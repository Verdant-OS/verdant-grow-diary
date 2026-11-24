/**
 * Spider Farmer GGS room mismatch is a review warning only.
 * Prior room ids come from stored raw_payload, not a new column.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parseEnvironmentCSVText } from "@/lib/csvParser";
import { GgsCsvRoomMismatchRules } from "@/lib/ggsCsvRoomMismatchRules";
import { GgsCsvPriorRoomLookup } from "@/lib/ggsCsvPriorRoomLookup";
import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";

const ROOT = resolve(__dirname, "../..");
const readFixture = (name: string) =>
  readFileSync(resolve(ROOT, "fixtures/sensor-csv", name), "utf8");

const ROOM_2 = readFixture("spider_farmer_ggs_room_2_synthetic.csv");
const ROOM_1 = readFixture("spider_farmer_ggs_room_1_synthetic.csv");
const NO_ROOM = readFixture("environment_no_room_id_synthetic.csv");

function storedPayload(roomId: string) {
  return { csv_import: true, source_app: "spider_farmer", raw_row: { roomId } };
}

describe("GgsCsvRoomMismatchRules", () => {
  it("warns when the file room differs from a room already stored on the tent", () => {
    const file = GgsCsvRoomMismatchRules.fileRoomIds(parseEnvironmentCSVText(ROOM_2).validRows);
    expect(file).toEqual(["2"]);
    const different = GgsCsvRoomMismatchRules.differentStoredRoomIds(file, [
      storedPayload("1"),
      { room_id: "1" },
    ]);
    expect(different).toEqual(["1"]);
    const warning = GgsCsvRoomMismatchRules.warning(file, different);
    expect(warning).toContain("room 2");
    expect(warning).toContain("room 1");
  });

  it("warns when the file keeps the tent's room and adds another", () => {
    const warning = GgsCsvRoomMismatchRules.warning(["1", "2"], ["1"]);
    expect(warning).toContain("room 1 and room 2");
    expect(warning).toContain("from room 1");
    expect(GgsCsvRoomMismatchRules.fileRoomsMissingFromStored(["1", "2"], ["1"])).toEqual(["2"]);
  });

  it("stays silent when the stored room matches the file", () => {
    const file = GgsCsvRoomMismatchRules.fileRoomIds(parseEnvironmentCSVText(ROOM_1).validRows);
    const different = GgsCsvRoomMismatchRules.differentStoredRoomIds(file, [
      storedPayload("1"),
      { raw_row: { roomId: "1" }, room_id: "1" },
    ]);
    expect(different).toEqual([]);
    expect(GgsCsvRoomMismatchRules.warning(file, different)).toBeNull();
  });

  it("stays silent when the tent has no room-tagged CSV data", () => {
    const file = GgsCsvRoomMismatchRules.fileRoomIds(parseEnvironmentCSVText(ROOM_2).validRows);
    const different = GgsCsvRoomMismatchRules.differentStoredRoomIds(file, [
      { csv_import: true, raw_row: { temperature: "22" } },
      { room_id: "  " },
    ]);
    expect(different).toEqual([]);
    expect(GgsCsvRoomMismatchRules.warning(file, different)).toBeNull();
  });

  it("leaves a file with no roomId unchanged", () => {
    const parsed = parseEnvironmentCSVText(NO_ROOM);
    expect(parsed.validRows.length).toBeGreaterThan(0);
    expect(GgsCsvRoomMismatchRules.fileRoomIds(parsed.validRows)).toEqual([]);
    expect(
      GgsCsvRoomMismatchRules.warning(
        [],
        GgsCsvRoomMismatchRules.differentStoredRoomIds([], [storedPayload("1")]),
      ),
    ).toBeNull();
    expect(GgsCsvRoomMismatchRules.differentRoomOrFilter([])).toBeNull();
  });

  it("builds a room filter that excludes the file room", () => {
    expect(GgsCsvRoomMismatchRules.differentRoomOrFilter(["2"])).toBe(
      "raw_payload->raw_row->>roomId.neq.2,raw_payload->>room_id.neq.2",
    );
    expect(GgsCsvRoomMismatchRules.differentRoomOrFilter(["2;drop"])).toBeNull();
  });
});

describe("GgsCsvPriorRoomLookup", () => {
  it("returns stored rooms from the tagged sample and the outside-file sample", async () => {
    const calls: string[] = [];
    const client = {
      from(table: "sensor_readings") {
        expect(table).toBe("sensor_readings");
        let filter = "";
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          or(filters: string) {
            filter = filters;
            calls.push(filters);
            return this;
          },
          limit() {
            const data = filter.includes("not.is.null")
              ? [{ raw_payload: storedPayload("1") }]
              : [{ raw_payload: storedPayload("9") }];
            return Promise.resolve({ data, error: null });
          },
        };
      },
    };
    const ids = await GgsCsvPriorRoomLookup.storedRoomIds("tent-1", ["2"], client);
    expect(calls).toEqual([
      "raw_payload->raw_row->>roomId.not.is.null,raw_payload->>room_id.not.is.null",
      "raw_payload->raw_row->>roomId.neq.2,raw_payload->>room_id.neq.2",
    ]);
    expect(ids).toEqual(["1", "9"]);

    const failed = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          or() {
            return this;
          },
          limit() {
            return Promise.resolve({ data: null, error: { message: "unavailable" } });
          },
        };
      },
    };
    expect(await GgsCsvPriorRoomLookup.storedRoomIds("tent-1", ["2"], failed)).toEqual(
      [],
    );
  });
});

async function openFile(csv: string, name: string, lookup?: (ids: readonly string[]) => Promise<readonly string[]>) {
  const onConfirm = vi.fn().mockResolvedValue({ insertedCount: 1, error: null });
  render(
    <EnvironmentCsvImportModal
      open
      onOpenChange={() => {}}
      onConfirm={onConfirm}
      lookupDifferentGgsRoomIds={lookup}
    />,
  );
  const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
  Object.defineProperty(input, "files", {
    value: [new File([csv], name, { type: "text/csv" })],
  });
  fireEvent.change(input);
  await waitFor(() => expect(screen.getByTestId("csv-import-preview")).toBeTruthy());
  return onConfirm;
}

describe("import review room warning", () => {
  it("names both rooms before confirm and still allows import", async () => {
    const lookup = vi.fn().mockResolvedValue(["1"]);
    const onConfirm = await openFile(ROOM_2, "spider_farmer_ggs_room_2_synthetic.csv", lookup);
    const warning = await screen.findByTestId("csv-import-room-mismatch");
    expect(warning.textContent).toContain("room 2");
    expect(warning.textContent).toContain("room 1");
    expect(lookup).toHaveBeenCalledWith(["2"]);
    expect(screen.getByTestId("csv-import-confirm")).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("shows no warning for the same room, no prior room, or a file without roomId", async () => {
    const same = vi.fn().mockResolvedValue(["1"]);
    await openFile(ROOM_1, "spider_farmer_ggs_room_1_synthetic.csv", same);
    await waitFor(() => expect(same).toHaveBeenCalled());
    expect(screen.queryByTestId("csv-import-room-mismatch")).toBeNull();
    cleanup();

    const none = vi.fn().mockResolvedValue([]);
    await openFile(ROOM_2, "spider_farmer_ggs_room_2_synthetic.csv", none);
    await waitFor(() => expect(none).toHaveBeenCalled());
    expect(screen.queryByTestId("csv-import-room-mismatch")).toBeNull();
    cleanup();

    const untouched = vi.fn();
    await openFile(NO_ROOM, "environment_no_room_id_synthetic.csv", untouched);
    expect(untouched).not.toHaveBeenCalled();
    expect(screen.queryByTestId("csv-import-room-mismatch")).toBeNull();
  });
});
