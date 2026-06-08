/**
 * aiDoctorContextCompiler — pure compiler that assembles AI Doctor
 * context sources, keeping Environment Check evidence (local EcoWitt
 * validation) SEPARATE from live sensor readings.
 *
 * Hard constraints:
 *  - Pure / deterministic.
 *  - Environment Check context is never merged into live sensor context.
 *  - Local/test validation evidence is never labeled "live".
 *  - No automation, no device control, no Action Queue writes.
 */

import {
  buildAiDoctorEnvironmentCheckContext,
  selectLatestEnvironmentCheckEvent,
  type AiDoctorEnvironmentCheckResult,
  type EnvironmentCheckEventInput,
} from "./aiDoctorEnvironmentCheckRules";
import type { AiDoctorSensorContext } from "./aiDoctorSensorContextRules";

export interface CompileAiDoctorContextInput {
  /** Live sensor context from NEX-6 mapping (if any). */
  sensorContext?: AiDoctorSensorContext | null;
  /** Recent diary/grow_events candidates (already fetched by caller). */
  environmentCheckEvents?: readonly EnvironmentCheckEventInput[] | null;
}

export interface CompiledAiDoctorContext {
  /** Live sensor evidence (unchanged from existing behavior). */
  sensor: AiDoctorSensorContext | null;
  /** Local/test Environment Check evidence, kept SEPARATE from live. */
  environmentCheck: AiDoctorEnvironmentCheckResult;
  /** Combined safety notes (sensor + environment-check). Deterministic. */
  combinedSafetyNotes: string[];
  /** True only when caller has at least one usable evidence source. */
  hasAnyEvidence: boolean;
}

export function compileAiDoctorContext(
  input: CompileAiDoctorContextInput,
): CompiledAiDoctorContext {
  const sensor = input.sensorContext ?? null;
  const latestEvent = selectLatestEnvironmentCheckEvent(
    input.environmentCheckEvents ?? [],
  );
  const environmentCheck = buildAiDoctorEnvironmentCheckContext(latestEvent);

  const combined: string[] = [];
  const push = (n: string) => {
    if (!combined.includes(n)) combined.push(n);
  };
  if (sensor) for (const n of sensor.safetyNotes) push(n);
  if (environmentCheck.present) for (const n of environmentCheck.safetyNotes) push(n);

  const hasAnyEvidence =
    (sensor !== null && sensor.usableMetrics.length > 0) ||
    environmentCheck.present;

  return {
    sensor,
    environmentCheck,
    combinedSafetyNotes: combined,
    hasAnyEvidence,
  };
}
