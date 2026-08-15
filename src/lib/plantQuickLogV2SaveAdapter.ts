/**
 * PlantQuickLog → quicklog_save_manual adapter.
 *
 * Pure (no I/O, no JSX). Maps the Plant Detail Gate 1 sheet onto the
 * existing RPC payload. Does not expand the RPC allow-list: action is
 * always `note` (this sheet has no watering volume).
 *
 * Temperature is typed as °F in the sheet and converted to °C exactly
 * once for `p_temperature_c`. The diary companion keeps the canonical
 * `details.manual_sensor_snapshot.temp_f` + `source: "manual"`.
 */

import { fahrenheitToCelsius } from "@/lib/temperatureUnits";
import {
  buildQuickLogDetails,
  parseOptionalNumber,
  type QuickLogSensorInput,
} from "@/lib/quickLogRules";
import {
  buildQuickLogV2SavePayload,
  type BuildResult,
} from "@/lib/quickLogV2SavePayload";

export type PlantQuickLogV2SaveInput = {
  plantId: string;
  plantName?: string | null;
  growId: string;
  tentId?: string | null;
  note: string;
  sensors: QuickLogSensorInput;
  photoUrl?: string | null;
  idempotencyKey: string;
};

export function buildPlantQuickLogV2SavePayload(
  input: PlantQuickLogV2SaveInput,
): BuildResult {
  const plantId = input.plantId?.trim() ?? "";
  const growId = input.growId?.trim() ?? "";
  const note = (input.note ?? "").trim();
  if (!plantId) return { ok: false, reason: "missing_plant_id" };
  if (!growId) return { ok: false, reason: "missing_grow_id" };
  if (!note) return { ok: false, reason: "missing_note" };

  const details = buildQuickLogDetails({
    plantId,
    plantName: input.plantName ?? null,
    tentId: input.tentId ?? null,
    sensors: input.sensors,
  });
  const detailsRecord: Record<string, unknown> = {
    ...details,
    grow_id: growId,
  };
  const photoUrl = input.photoUrl?.trim() ?? "";
  if (photoUrl) detailsRecord.photo_url = photoUrl;

  const tempF = parseOptionalNumber(input.sensors.temp);
  const humidity = parseOptionalNumber(input.sensors.humidity);

  return buildQuickLogV2SavePayload({
    resolved: {
      ok: true,
      targetType: "plant",
      targetId: plantId,
      plantId,
      tentId: input.tentId?.trim() || null,
      growId,
    },
    action: "note",
    volumeMl: "",
    note,
    temperatureC: tempF == null ? "" : String(fahrenheitToCelsius(tempF)),
    humidityPct: humidity == null ? "" : String(humidity),
    vpdKpa: "",
    details: detailsRecord,
    idempotencyKey: input.idempotencyKey,
  });
}
