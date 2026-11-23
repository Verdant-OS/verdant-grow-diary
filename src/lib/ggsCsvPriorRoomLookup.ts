/**
 * Reads room ids already stored for one tent. Selects raw_payload only,
 * and only rows whose stored room id is outside the file's room ids, so a
 * same-room tent does not download its history.
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
  static async differentStoredRoomIds(
    tentId: string,
    fileRoomIds: readonly string[],
    client: RoomProbeClient = supabase as unknown as RoomProbeClient,
  ): Promise<string[]> {
    const tent = tentId.trim();
    const filter = GgsCsvRoomMismatchRules.differentRoomOrFilter(fileRoomIds);
    if (!tent || !filter) return [];
    const { data, error } = await client
      .from("sensor_readings")
      .select("raw_payload")
      .eq("tent_id", tent)
      .eq("source", "csv")
      .or(filter)
      .limit(DIFFERENT_ROOM_LIMIT);
    if (error || !data) return [];
    return GgsCsvRoomMismatchRules.differentStoredRoomIds(
      fileRoomIds,
      data.map((row) => row.raw_payload),
    );
  }
}
