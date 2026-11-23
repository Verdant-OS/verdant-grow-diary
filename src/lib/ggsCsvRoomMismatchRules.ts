/**
 * Warning-only comparison of a Spider Farmer GGS CSV room id against room
 * ids already stored on the tent. Does not change the dedupe key and does
 * not block import.
 *
 * Prior rooms live in sensor_readings.raw_payload: the CSV parser keeps the
 * export cell on raw_row.roomId, and the registry adapter also writes
 * room_id. No extra column is required.
 */

export const GGS_CSV_ROOM_MISMATCH_TEST_ID = "csv-import-room-mismatch" as const;

const ROOM_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

export class GgsCsvRoomMismatchRules {
  /** Non-empty roomId cells on parsed rows. Order is first-seen, then stable. */
  static fileRoomIds(
    rows: readonly { raw_payload?: Record<string, string> | null }[],
  ): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const raw = row.raw_payload?.roomId;
      const id = typeof raw === "string" ? raw.trim() : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }

  /** Room ids carried on one stored raw_payload. Blank values are ignored. */
  static storedRoomIds(payload: unknown): string[] {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
    const record = payload as Record<string, unknown>;
    const ids: string[] = [];
    const push = (value: unknown) => {
      if (typeof value !== "string") return;
      const id = value.trim();
      if (!id || ids.includes(id)) return;
      ids.push(id);
    };
    const rawRow = record.raw_row;
    if (rawRow && typeof rawRow === "object" && !Array.isArray(rawRow)) {
      push((rawRow as Record<string, unknown>).roomId);
    }
    push(record.room_id);
    return ids;
  }

  /**
   * Stored room ids that are not in the file. Empty when the file has no
   * room id, the tent has no room-tagged GGS rows, or every stored room id
   * is one of the file's room ids.
   */
  static differentStoredRoomIds(
    fileRoomIds: readonly string[],
    storedPayloads: readonly unknown[],
  ): string[] {
    if (fileRoomIds.length === 0) return [];
    const file = new Set(fileRoomIds);
    const different: string[] = [];
    for (const payload of storedPayloads) {
      for (const id of GgsCsvRoomMismatchRules.storedRoomIds(payload)) {
        if (file.has(id) || different.includes(id)) continue;
        different.push(id);
      }
    }
    return different;
  }

  static warning(fileRoomIds: readonly string[], differentStoredRoomIds: readonly string[]): string | null {
    if (fileRoomIds.length === 0 || differentStoredRoomIds.length === 0) return null;
    const fileLabel = fileRoomIds.map((id) => `room ${id}`).join(" and ");
    const storedLabel = differentStoredRoomIds.map((id) => `room ${id}`).join(" and ");
    return `This file is Spider Farmer ${fileLabel}. This tent already has Spider Farmer CSV data from ${storedLabel}. Those rooms do not match. You can still import. The duplicate check only compares tent, source, metric, and time, so a wrong-room file can look like a full set of duplicates.`;
  }

  /** PostgREST `.or()` fragment. Null when an id is not a safe filter token. */
  static differentRoomOrFilter(fileRoomIds: readonly string[]): string | null {
    if (fileRoomIds.length === 0) return null;
    if (!fileRoomIds.every((id) => ROOM_TOKEN.test(id))) return null;
    if (fileRoomIds.length === 1) {
      const id = fileRoomIds[0];
      return `raw_payload->raw_row->>roomId.neq.${id},raw_payload->>room_id.neq.${id}`;
    }
    const list = fileRoomIds.join(",");
    return `raw_payload->raw_row->>roomId.not.in.(${list}),raw_payload->>room_id.not.in.(${list})`;
  }
}
