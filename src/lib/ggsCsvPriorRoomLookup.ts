/**
 * Reads room ids already stored for one tent. Selects raw_payload only.
 *
 * Each file room is confirmed with its own equality probe (limit 1), so a
 * room that sits past the first page is not treated as missing. Extra stored
 * rooms are discovered one distinct id at a time, excluding ids already found.
 */
import { supabase } from "@/integrations/supabase/client";
import { GgsCsvRoomMismatchRules } from "@/lib/ggsCsvRoomMismatchRules";

const PROBE_LIMIT = 1;
const MAX_EXTRA_ROOMS = 20;

type RoomProbeQuery = {
  select(columns: string): RoomProbeQuery;
  eq(column: string, value: string): RoomProbeQuery;
  or(filters: string): RoomProbeQuery;
  limit(count: number): Promise<{
    data: { raw_payload: unknown }[] | null;
    error: { message: string } | null;
  }>;
};

type RoomProbeClient = {
  from(table: "sensor_readings"): RoomProbeQuery;
};

export class GgsCsvPriorRoomLookup {
  static async probe(
    client: RoomProbeClient,
    tentId: string,
    filter: string,
    limit: number,
  ): Promise<{ raw_payload: unknown }[] | null> {
    const { data, error } = await client
      .from("sensor_readings")
      .select("raw_payload")
      .eq("tent_id", tentId)
      .eq("source", "csv")
      .or(filter)
      .limit(limit);
    if (error || !data) return null;
    return data;
  }

  /**
   * Stored room ids for the tent. File rooms are included only when an
   * equality probe finds that exact id. Empty when the file has no safe
   * room id or a probe fails.
   */
  static async storedRoomIds(
    tentId: string,
    fileRoomIds: readonly string[],
    client: RoomProbeClient = supabase as unknown as RoomProbeClient,
  ): Promise<string[]> {
    const tent = tentId.trim();
    if (!tent || !GgsCsvRoomMismatchRules.differentRoomOrFilter(fileRoomIds)) return [];
    const confirmed: string[] = [];
    for (const id of fileRoomIds) {
      const filter = GgsCsvRoomMismatchRules.roomEqualityOrFilter(id);
      if (!filter) return [];
      const rows = await GgsCsvPriorRoomLookup.probe(client, tent, filter, PROBE_LIMIT);
      if (!rows) return [];
      const seen = GgsCsvRoomMismatchRules.uniqueStoredRoomIds(rows.map((row) => row.raw_payload));
      if (seen.includes(id)) confirmed.push(id);
    }
    const extras: string[] = [];
    const excluded = new Set<string>(fileRoomIds);
    for (let n = 0; n < MAX_EXTRA_ROOMS; n += 1) {
      const filter = GgsCsvRoomMismatchRules.differentRoomOrFilter([...excluded]);
      if (!filter) break;
      const rows = await GgsCsvPriorRoomLookup.probe(client, tent, filter, PROBE_LIMIT);
      if (!rows) return [];
      if (rows.length === 0) break;
      const fresh = GgsCsvRoomMismatchRules.uniqueStoredRoomIds(
        rows.map((row) => row.raw_payload),
      ).filter((id) => !excluded.has(id));
      if (fresh.length === 0) break;
      let stopped = false;
      for (const id of fresh) {
        extras.push(id);
        if (!GgsCsvRoomMismatchRules.roomEqualityOrFilter(id)) {
          stopped = true;
          break;
        }
        excluded.add(id);
      }
      if (stopped) break;
    }
    return [...confirmed, ...extras];
  }
}
