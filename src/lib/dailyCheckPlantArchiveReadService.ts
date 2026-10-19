import { supabase } from "@/integrations/supabase/client";
import {
  readDailyCheckPlantArchiveFromLimit,
  startDailyCheckPlantArchiveDecision,
  type DailyCheckPlantArchiveRead,
} from "@/lib/dailyCheckPlantSelectionRules";

type PlantArchiveQuery = {
  eq?: (column: string, value: string) => PlantArchiveQuery;
  limit?: (count: number) => PromiseLike<{ data: unknown; error: unknown }>;
  maybeSingle?: () => PromiseLike<{ data: unknown; error: unknown }>;
};

type PlantArchiveRowResult = { data: unknown; error: unknown };

export type PlantArchiveRowReader = (plantId: string) => PromiseLike<PlantArchiveRowResult>;

const PLANT_ARCHIVE_READ_FAILED: PlantArchiveRowResult = {
  data: null,
  error: { message: "plant archive read failed" },
};

/**
 * Optional override. Production leaves this unset and uses the Supabase
 * reader below. Tests that need a different row can install one. The safe
 * default, when the installed reader or the client cannot start a plants
 * query, is to throw so the decision helper does not block the save.
 */
let installedReader: PlantArchiveRowReader | null = null;

export function installPlantArchiveRowReader(reader: PlantArchiveRowReader | null): void {
  installedReader = reader;
}

export function plantArchiveRowReader(): PlantArchiveRowReader {
  return installedReader ?? readPlantArchiveRowFromSupabase;
}

function asRowResult(result: PlantArchiveRowResult | null | undefined): PlantArchiveRowResult {
  if (!result) return PLANT_ARCHIVE_READ_FAILED;
  if (result.error) return result;
  if (Array.isArray(result.data)) return result;
  if (result.data && typeof result.data === "object") {
    return { data: [result.data], error: null };
  }
  return { data: [], error: null };
}

/**
 * Production plants read. A client with no `from`, or one that refuses the
 * plants table, has not run an archive read: throw so the save stays allowed.
 * Once `limit` or `maybeSingle` is actually invoked, a throw, rejection,
 * error, empty row, or non-boolean flag resolves as a failed read and blocks.
 */
export function readPlantArchiveRowFromSupabase(
  plantId: string,
): PromiseLike<PlantArchiveRowResult> {
  const from = (supabase as { from?: (table: string) => unknown }).from;
  if (typeof from !== "function") {
    throw new Error("plant archive read unavailable");
  }
  let relation: { select?: (columns: string) => PlantArchiveQuery };
  try {
    relation = from("plants") as { select?: (columns: string) => PlantArchiveQuery };
  } catch {
    throw new Error("plant archive read unavailable");
  }
  if (!relation || typeof relation.select !== "function") {
    throw new Error("plant archive read unavailable");
  }
  const table = relation as {
    select: (columns: string) => PlantArchiveQuery;
    update?: unknown;
    delete?: unknown;
    upsert?: unknown;
    maybeSingle?: unknown;
  };
  // Diary doubles expose select only. Do not call select on those, or their
  // diary counter records a plants read. A plants client exposes a write
  // method, or maybeSingle already on the table double.
  if (
    typeof table.update !== "function" &&
    typeof table.delete !== "function" &&
    typeof table.upsert !== "function" &&
    typeof table.maybeSingle !== "function"
  ) {
    throw new Error("plant archive read unavailable");
  }
  const filtered = table.select("is_archived")?.eq?.("id", plantId);
  if (!filtered) throw new Error("plant archive read unavailable");
  // A single-row plants read can maybeSingle. Production filters can.
  // A generic limit() that cannot maybeSingle is not that read.
  const read =
    typeof filtered.maybeSingle === "function" && typeof filtered.limit === "function"
      ? filtered.limit.bind(filtered, 1)
      : typeof filtered.maybeSingle === "function"
        ? filtered.maybeSingle.bind(filtered)
        : null;
  if (!read) throw new Error("plant archive read unavailable");
  return Promise.resolve()
    .then(() => read())
    .then(asRowResult, () => PLANT_ARCHIVE_READ_FAILED);
}

export function startSavedPlantArchiveDecision(plantId: string | null | undefined) {
  const read = plantArchiveRowReader();
  return startDailyCheckPlantArchiveDecision(plantId, () => read(plantId ?? ""));
}

export async function readDailyCheckPlantArchive(
  plantId: string,
): Promise<DailyCheckPlantArchiveRead> {
  try {
    const result = await plantArchiveRowReader()(plantId);
    return readDailyCheckPlantArchiveFromLimit(() => Promise.resolve(result));
  } catch {
    return { status: "active" };
  }
}
