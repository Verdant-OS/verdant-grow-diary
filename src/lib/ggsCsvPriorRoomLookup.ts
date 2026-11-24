/**
 * Reads room ids already stored for one tent. Selects raw_payload only.
 * One probe samples rows that carry a room id. A second probe samples rows
 * whose room id is outside the file, so a later different room is not hidden
 * behind a long run of the file's own room.
 */
import { supabase } from "@/integrations/supabase/client";
import { GgsCsvRoomMismatchRules } from "@/lib/ggsCsvRoomMismatchRules";

const DIFFERENT_ROOM_LIMIT = 20;

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
  ): Promise<{ raw_payload: unknown }[] | null> {
    const { data, error } = await client
      .from("sensor_readings")
      .select("raw_payload")
      .eq("tent_id", tentId)
      .eq("source", "csv")
      .or(filter)
      .limit(DIFFERENT_ROOM_LIMIT);
    if (error || !data) return null;
    return data;
  }

  /** Stored room ids seen for the tent. Empty when the file has no room or a probe fails. */
  static async storedRoomIds(
    tentId: string,
    fileRoomIds: readonly string[],
    client: RoomProbeClient = supabase as unknown as RoomProbeClient,
  ): Promise<string[]> {
    const tent = tentId.trim();
    const outside = GgsCsvRoomMismatchRules.differentRoomOrFilter(fileRoomIds);
    if (!tent || !outside) return [];
    const tagged = await GgsCsvPriorRoomLookup.probe(
      client,
      tent,
      GgsCsvRoomMismatchRules.taggedRoomOrFilter(),
    );
    const different = await GgsCsvPriorRoomLookup.probe(client, tent, outside);
    if (!tagged || !different) return [];
    return GgsCsvRoomMismatchRules.uniqueStoredRoomIds([
      ...tagged.map((row) => row.raw_payload),
      ...different.map((row) => row.raw_payload),
    ]);
  }
}
