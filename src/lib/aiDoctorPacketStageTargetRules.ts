/**
 * aiDoctorPacketStageTargetRules — stop the AI Doctor packet calling an
 * out-of-target reading "ok".
 *
 * QA 2026-09-24 (BUG-008): the current sensor snapshot is graded only for
 * plausibility and freshness, so RH 95% in a flowering plant's tent went to
 * the model as `severity: "ok"` while an open alert existed for the same
 * reading. The grounding rules let the model describe the environment as
 * stable/healthy when severity is "ok".
 *
 * This post-processes the built request packet with the plant's own stage
 * and the same stage bands the Sensors/Alerts surfaces use: any reading
 * outside its stage target raises "ok" to "warning" and adds a model-facing
 * safety note naming the reading and the band. "invalid" is never
 * downgraded. It runs client-side before send and is deliberately NOT in the
 * edge mirror, so the Deno bundle is unchanged.
 *
 * Pure: no I/O, no clock.
 */
import {
  classifyRhAgainstStage,
  classifyTempAgainstStage,
  type EnvClassificationResult,
} from "@/lib/environmentStageTargetRules";
import { classifyVpdAgainstStage } from "@/lib/vpdStageTargetRules";

/** Mirrors NOTE_CAP in aiDoctorReviewRequestPacketValidationRules (server). */
export const AI_DOCTOR_PACKET_SAFETY_NOTE_CAP = 12;

interface ReadingLike {
  field: string;
  value: number;
  unit: string;
}

export interface StageTargetBreach {
  metric: "humidity" | "temperature" | "vpd";
  direction: "above" | "below";
  note: string;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function breachFrom(
  metric: StageTargetBreach["metric"],
  label: string,
  unit: string,
  result: Pick<EnvClassificationResult, "classification" | "value"> & {
    band: { stage: string; min: number | null; max: number | null };
  },
): StageTargetBreach | null {
  if (result.classification !== "above_target" && result.classification !== "below_target") {
    return null;
  }
  if (result.value === null || result.band.min === null || result.band.max === null) return null;
  const direction = result.classification === "above_target" ? "above" : "below";
  const stage = result.band.stage.replace("_", " ");
  return {
    metric,
    direction,
    note: `Current ${label} ${fmt(result.value)}${unit} is ${direction} the ${stage} target range (${fmt(result.band.min)}–${fmt(result.band.max)}${unit}). Do not describe the environment as stable or healthy.`,
  };
}

/** Readings outside the plant stage's target bands, in a fixed metric order. */
export function findStageTargetBreaches(
  readings: readonly ReadingLike[],
  stage: string | null | undefined,
): StageTargetBreach[] {
  if (!stage) return [];
  const byField = new Map(readings.map((r) => [r.field, r.value]));
  const out: StageTargetBreach[] = [];
  const rh = byField.get("humidity_pct");
  if (typeof rh === "number") {
    const b = breachFrom("humidity", "humidity", "%", classifyRhAgainstStage(rh, { stage }));
    if (b) out.push(b);
  }
  const tempC =
    byField.get("temperature_c") ??
    (typeof byField.get("temperature_f") === "number"
      ? ((byField.get("temperature_f") as number) - 32) * (5 / 9)
      : undefined);
  if (typeof tempC === "number") {
    const b = breachFrom(
      "temperature",
      "air temperature",
      "°C",
      classifyTempAgainstStage(tempC, { stage, tempUnit: "celsius" }),
    );
    if (b) out.push(b);
  }
  const vpd = byField.get("vpd_kpa");
  if (typeof vpd === "number") {
    const b = breachFrom("vpd", "VPD", " kPa", classifyVpdAgainstStage({ value: vpd, stage }));
    if (b) out.push(b);
  }
  return out;
}

interface PacketLike {
  plant: { stage: string | null };
  recentSensorSnapshot: {
    severity: "ok" | "warning" | "invalid";
    readings: ReadingLike[];
  } | null;
  recentSensorSnapshotAnnotation?: { safetyNotes: string[] } | null;
}

export function applyStageTargetSeverityToPacket<P extends PacketLike>(packet: P): P {
  const snapshot = packet.recentSensorSnapshot;
  if (!snapshot || snapshot.severity === "invalid") return packet;
  const breaches = findStageTargetBreaches(snapshot.readings, packet.plant.stage);
  if (breaches.length === 0) return packet;
  const annotation = packet.recentSensorSnapshotAnnotation;
  const notes = annotation ? [...annotation.safetyNotes] : null;
  if (notes) {
    for (const breach of breaches) {
      if (notes.length >= AI_DOCTOR_PACKET_SAFETY_NOTE_CAP) break;
      if (!notes.includes(breach.note)) notes.push(breach.note);
    }
  }
  return {
    ...packet,
    recentSensorSnapshot: { ...snapshot, severity: "warning" },
    ...(annotation && notes
      ? { recentSensorSnapshotAnnotation: { ...annotation, safetyNotes: notes } }
      : {}),
  };
}
