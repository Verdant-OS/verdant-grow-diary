/**
 * aiDoctorPacketServerFreshnessRules — the server re-derives sensor freshness
 * for an AI Doctor review packet instead of trusting the browser's labels.
 *
 * AI-DOCTOR-EDGE-AUDIT (2026-11-05), gap G1: ai-doctor-review validated the
 * packet's `stale`, `trust` and `missingLiveSensorReadings` for type only. A
 * direct caller could send an old reading labeled `source=live, stale=false`
 * with `missingLiveSensorReadings=false`; every server gate passed and the
 * model could call the environment healthy.
 *
 * This runs after server validation and before any credit is spent. It is
 * downgrade-only:
 *  - A `live` or `manual` snapshot older than its Sensor Truth Canon window
 *    (live 15 min, manual 24 h), with an unparseable capture time, or captured
 *    more than the future-skew allowance ahead of the server clock becomes
 *    `stale=true, trust=low`, matching what the browser builder emits for a
 *    stale reading. Its source label is never changed.
 *  - `missingLiveSensorReadings` is true unless the server itself sees a fresh
 *    `live` annotation. A snapshot sent without an annotation is therefore
 *    treated as not live (owner decision, 2026-11-05).
 *  - It never upgrades a label, never clears `stale`, and never sets
 *    `missingLiveSensorReadings` back to false.
 *
 * Out of reach here: whether a `live` label is true at all. That needs a
 * server read of the stored reading and is not part of this rule.
 *
 * Pure: no I/O, no clock (`now` is injected). Idempotent.
 */
import { isFreshLiveSnapshotAnnotation } from "@/lib/aiDoctorContextCompiler";
import { resolveCurrentStateStaleWindowMs } from "@/lib/sensorTruthCanon";
import { SENSOR_TRUTH_FUTURE_SKEW_MS } from "@/constants/sensorTruthRanges";

/** Mirrors NOTE_CAP in aiDoctorReviewRequestPacketValidationRules (server). */
const SAFETY_NOTE_CAP = 12;

/** Same wording the browser builder adds for a stale reading. */
export const AI_DOCTOR_SERVER_STALE_SNAPSHOT_NOTE =
  "Snapshot is older than the freshness window; readings may not reflect current tent conditions.";

export const AI_DOCTOR_SERVER_FUTURE_SNAPSHOT_NOTE =
  "Snapshot capture time is ahead of the server clock; freshness cannot be verified.";

export const AI_DOCTOR_SERVER_UNVERIFIED_SNAPSHOT_NOTE =
  "Snapshot capture time could not be read; freshness cannot be verified.";

const STALE_LINE_SUFFIX = " (stale: readings may not reflect current tent conditions)";

const LINE_PREFIX_RE =
  /^LATEST_SENSOR_SNAPSHOT \[source=([a-z]+), stale=(?:true|false), trust=(?:low|medium|high)\]: /;

interface AnnotationLike {
  line: string;
  source: string;
  stale: boolean;
  trust: "low" | "medium" | "high";
  safetyNotes: string[];
}

interface PacketLike {
  recentSensorSnapshot: { capturedAt: string } | null;
  recentSensorSnapshotAnnotation?: AnnotationLike | null;
  missingLiveSensorReadings?: boolean;
}

export type ServerFreshnessVerdict = "fresh" | "stale" | "future" | "unverifiable";

/**
 * Freshness of a `live` or `manual` capture time against the server clock.
 * Exactly on the window is fresh (strict `>`), matching the browser builder.
 */
export function classifyServerSnapshotFreshness(
  source: "live" | "manual",
  capturedAt: string,
  now: Date,
): ServerFreshnessVerdict {
  const capturedMs = Date.parse(capturedAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(capturedMs) || !Number.isFinite(nowMs)) return "unverifiable";
  const ageMs = nowMs - capturedMs;
  if (ageMs < -SENSOR_TRUTH_FUTURE_SKEW_MS) return "future";
  return ageMs > resolveCurrentStateStaleWindowMs(source) ? "stale" : "fresh";
}

function withNote(notes: readonly string[], note: string): string[] {
  if (notes.includes(note)) return [...notes];
  const out = [...notes];
  // The downgrade must reach the model: inside the cap, replace the last note.
  if (out.length >= SAFETY_NOTE_CAP) out.splice(SAFETY_NOTE_CAP - 1);
  out.push(note);
  return out;
}

function staleLine(line: string): string {
  const match = LINE_PREFIX_RE.exec(line);
  if (!match) return line;
  const rest = line.slice(match[0].length);
  const message = rest.endsWith(STALE_LINE_SUFFIX) ? rest : `${rest}${STALE_LINE_SUFFIX}`;
  return `LATEST_SENSOR_SNAPSHOT [source=${match[1]}, stale=true, trust=low]: ${message}`;
}

function noteFor(verdict: Exclude<ServerFreshnessVerdict, "fresh">): string {
  if (verdict === "future") return AI_DOCTOR_SERVER_FUTURE_SNAPSHOT_NOTE;
  if (verdict === "unverifiable") return AI_DOCTOR_SERVER_UNVERIFIED_SNAPSHOT_NOTE;
  return AI_DOCTOR_SERVER_STALE_SNAPSHOT_NOTE;
}

export function applyServerFreshnessToPacket<P extends PacketLike>(packet: P, now: Date): P {
  const snapshot = packet.recentSensorSnapshot;
  let annotation = packet.recentSensorSnapshotAnnotation ?? null;

  if (
    snapshot &&
    annotation &&
    annotation.stale === false &&
    (annotation.source === "live" || annotation.source === "manual")
  ) {
    const verdict = classifyServerSnapshotFreshness(annotation.source, snapshot.capturedAt, now);
    if (verdict !== "fresh") {
      annotation = {
        ...annotation,
        line: staleLine(annotation.line),
        stale: true,
        trust: "low",
        safetyNotes: withNote(annotation.safetyNotes, noteFor(verdict)),
      };
    }
  }

  const missingLiveSensorReadings =
    packet.missingLiveSensorReadings === true ||
    !snapshot ||
    !isFreshLiveSnapshotAnnotation(annotation);

  const next: P = { ...packet, missingLiveSensorReadings };
  if (annotation !== (packet.recentSensorSnapshotAnnotation ?? null)) {
    next.recentSensorSnapshotAnnotation = annotation;
  }
  return next;
}
