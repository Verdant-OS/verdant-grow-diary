/**
 * Operator-only projection of typed root-zone events.
 *
 * AI Doctor's shared `RootZoneObservationV1` intentionally omits database
 * identifiers. Operator Mode needs a narrow identity envelope so it can keep
 * separate plants separate and compare only like-for-like records. This
 * adapter reuses the shared metric sanitizer, then admits only canonical UUID
 * identifiers from the already RLS-scoped row.
 */
import { isUuid } from "@/lib/isUuid";
import {
  buildRootZoneObservationFromGrowEvent,
  ROOT_ZONE_OBSERVATION_CAP,
  type RootZoneGrowEventRowLike,
  type RootZoneObservationV1,
} from "@/lib/rootZoneObservationRules";

export interface OperatorRootZoneRecordV1 extends RootZoneObservationV1 {
  eventId: string;
  plantId: string | null;
  tentId: string;
}

function compareOperatorRootZoneRecords(
  a: OperatorRootZoneRecordV1,
  b: OperatorRootZoneRecordV1,
): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt > b.occurredAt ? -1 : 1;
  if (a.eventId !== b.eventId) return a.eventId < b.eventId ? -1 : 1;
  const aJson = JSON.stringify(a);
  const bJson = JSON.stringify(b);
  return aJson < bJson ? -1 : aJson > bJson ? 1 : 0;
}

/**
 * Add the minimum identity needed by Operator Mode without changing or
 * weakening the privacy-minimized AI Doctor observation contract.
 */
export function buildOperatorRootZoneRecordFromGrowEvent(
  row: RootZoneGrowEventRowLike,
): OperatorRootZoneRecordV1 | null {
  const observation = buildRootZoneObservationFromGrowEvent(row);
  if (!observation || !isUuid(row.id) || !isUuid(row.tent_id)) return null;

  const rawPlantId = row.plant_id;
  let plantId: string | null;
  if (rawPlantId === null) {
    plantId = null;
  } else {
    if (!isUuid(rawPlantId)) return null;
    plantId = rawPlantId.toLowerCase();
  }

  return {
    ...observation,
    eventId: row.id.toLowerCase(),
    plantId,
    tentId: row.tent_id.toLowerCase(),
  };
}

/** Stable newest-first sort, event-id dedupe, and hard cap. */
export function buildOperatorRootZoneRecordsFromRows(
  rows: readonly RootZoneGrowEventRowLike[] | null | undefined,
  cap: number = ROOT_ZONE_OBSERVATION_CAP,
): OperatorRootZoneRecordV1[] {
  const boundedCap = Number.isFinite(cap)
    ? Math.max(0, Math.min(ROOT_ZONE_OBSERVATION_CAP, Math.floor(cap)))
    : ROOT_ZONE_OBSERVATION_CAP;
  if (boundedCap === 0) return [];

  const records = (rows ?? [])
    .map(buildOperatorRootZoneRecordFromGrowEvent)
    .filter((record): record is OperatorRootZoneRecordV1 => record !== null)
    .sort(compareOperatorRootZoneRecords);
  const output: OperatorRootZoneRecordV1[] = [];
  const seenEventIds = new Set<string>();
  for (const record of records) {
    if (seenEventIds.has(record.eventId)) continue;
    seenEventIds.add(record.eventId);
    output.push(record);
    if (output.length >= boundedCap) break;
  }
  return output;
}
