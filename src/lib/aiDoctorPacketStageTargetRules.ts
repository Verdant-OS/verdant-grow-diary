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
 * downgraded. It runs client-side before send, and ai-doctor-review applies
 * it again after server validation (through the edge mirror), so a packet
 * posted directly cannot carry an out-of-target reading as "ok" (Codex
 * review on #1683). It is idempotent.
 *
 * Every reading the grounding check accepts as humidity, temperature or VPD
 * evidence is graded, not only the canonical field names: RH 95% sent as `rh`
 * would otherwise stay "ok" and back a "stable" claim (Codex review on #1683).
 *
 * Pure: no I/O, no clock.
 */
import {
  classifyRhAgainstStage,
  classifyTempAgainstStage,
  type EnvClassificationResult,
} from "@/lib/environmentStageTargetRules";
import { classifyVpdAgainstStage } from "@/lib/vpdStageTargetRules";
import { canonicalSnapshotReadingValue } from "@/lib/aiDoctorReviewGroundingRules";

/** Mirrors NOTE_CAP in aiDoctorReviewRequestPacketValidationRules (server). */
export const AI_DOCTOR_PACKET_SAFETY_NOTE_CAP = 12;

interface ReadingLike {
  field: string;
  value: number;
  unit: string;
}

/** When set, the graded snapshot is stale and its notes name the capture time. */
export interface StageTargetTiming {
  readonly staleCapturedAt?: string | null;
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
  timing: StageTargetTiming,
): StageTargetBreach | null {
  if (result.classification !== "above_target" && result.classification !== "below_target") {
    return null;
  }
  if (result.value === null || result.band.min === null || result.band.max === null) return null;
  const direction = result.classification === "above_target" ? "above" : "below";
  const stage = result.band.stage.replace("_", " ");
  const value = `${fmt(result.value)}${unit}`;
  const range = `${stage} target range (${fmt(result.band.min)}–${fmt(result.band.max)}${unit})`;
  return {
    metric,
    direction,
    // A retained diary snapshot can be stale; never present it as current.
    note: timing.staleCapturedAt
      ? `Stale reading captured ${timing.staleCapturedAt}: ${label} ${value} was ${direction} the ${range}. It is not the current environment; do not describe the environment as stable or healthy.`
      : `Current ${label} ${value} is ${direction} the ${range}. Do not describe the environment as stable or healthy.`,
  };
}

/**
 * A reading's value for `metric` in %, °C or kPa, or null. A reading the
 * grounding check can read as that metric is graded exactly as it reads it:
 * by its declared unit, so `temperature_c` 25 in °F is −3.9 °C (Codex review
 * on #1683). A canonical packet field whose unit grounding cannot read is
 * still graded by its field name, as before.
 */
function metricValue(metric: StageTargetBreach["metric"], reading: ReadingLike): number | null {
  const grounded = canonicalSnapshotReadingValue(metric, reading);
  if (grounded !== null) return grounded;
  switch (metric) {
    case "humidity":
      return reading.field === "humidity_pct" ? reading.value : null;
    case "temperature":
      if (reading.field === "temperature_c") return reading.value;
      if (reading.field === "temperature_f") return (reading.value - 32) * (5 / 9);
      return null;
    case "vpd":
      return reading.field === "vpd_kpa" ? reading.value : null;
  }
}

function breachForValue(
  metric: StageTargetBreach["metric"],
  value: number,
  stage: string,
  timing: StageTargetTiming,
): StageTargetBreach | null {
  switch (metric) {
    case "humidity":
      return breachFrom(
        "humidity",
        "humidity",
        "%",
        classifyRhAgainstStage(value, { stage }),
        timing,
      );
    case "temperature":
      return breachFrom(
        "temperature",
        "air temperature",
        "°C",
        classifyTempAgainstStage(value, { stage, tempUnit: "celsius" }),
        timing,
      );
    case "vpd":
      return breachFrom("vpd", "VPD", " kPa", classifyVpdAgainstStage({ value, stage }), timing);
  }
}

const GRADED_METRICS: readonly StageTargetBreach["metric"][] = ["humidity", "temperature", "vpd"];

/**
 * Readings outside the plant stage's target bands: at most one per metric, in
 * a fixed metric order, each the first breaching reading of that metric.
 */
export function findStageTargetBreaches(
  readings: readonly ReadingLike[],
  stage: string | null | undefined,
  timing: StageTargetTiming = {},
): StageTargetBreach[] {
  if (!stage) return [];
  const out: StageTargetBreach[] = [];
  for (const metric of GRADED_METRICS) {
    for (const reading of readings) {
      const value = metricValue(metric, reading);
      if (value === null || !Number.isFinite(value)) continue;
      const breach = breachForValue(metric, value, stage, timing);
      if (breach) {
        out.push(breach);
        break;
      }
    }
  }
  return out;
}

interface PacketLike {
  plant: { stage: string | null };
  recentSensorSnapshot: {
    capturedAt?: string;
    severity: "ok" | "warning" | "invalid";
    readings: ReadingLike[];
  } | null;
  recentSensorSnapshotAnnotation?: { safetyNotes: string[]; stale?: boolean } | null;
}

export function applyStageTargetSeverityToPacket<P extends PacketLike>(packet: P): P {
  const snapshot = packet.recentSensorSnapshot;
  if (!snapshot || snapshot.severity === "invalid") return packet;
  const annotation = packet.recentSensorSnapshotAnnotation;
  const breaches = findStageTargetBreaches(snapshot.readings, packet.plant.stage, {
    staleCapturedAt: annotation?.stale === true ? (snapshot.capturedAt ?? "an unknown time") : null,
  });
  if (breaches.length === 0) return packet;
  const notes = annotation ? [...annotation.safetyNotes] : null;
  if (notes) {
    const fresh = breaches.map((b) => b.note).filter((note) => !notes.includes(note));
    const room = AI_DOCTOR_PACKET_SAFETY_NOTE_CAP - notes.length;
    if (fresh.length > 0 && room <= 0) {
      // The breach is what raised severity, so it must reach the model: keep
      // the first breach note inside the cap in place of the last note.
      notes.splice(AI_DOCTOR_PACKET_SAFETY_NOTE_CAP - 1);
      notes.push(fresh[0]);
    } else {
      notes.push(...fresh.slice(0, Math.max(0, room)));
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
