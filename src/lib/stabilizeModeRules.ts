/**
 * stabilizeModeRules — pure deterministic guidance helper.
 *
 * Detects when a grower may be in a reactive / high-risk period and returns
 * a calm low-pressure guidance card focused on one thing to watch, what not
 * to do, and the safest next log prompt.
 *
 * Hard constraints:
 *   - No I/O. No React. No Supabase. No fetch.
 *   - No AI / model calls. No Edge Function calls.
 *   - No alerts. No Action Queue writes. No automation. No device control.
 *   - No Date.now(); caller supplies `now`.
 *   - Deterministic for the same input.
 */

export type StabilizeModeLevel =
  | "off"
  | "watch"
  | "stabilize"
  | "urgent_review";

export type StabilizeModeConfidence = "low" | "medium" | "high";

export type StabilizeAiConfidence = "low" | "medium" | "high" | "unknown";

export type StabilizeSensorSourceSummary =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "mixed"
  | "none";

export interface StabilizeModeInput {
  /** Caller-injected current time (ISO string or epoch ms). */
  readonly now: string | number | Date;
  readonly plant_stage?: string | null;
  /** e.g. "healthy" | "recovering" | "stressed" | "autoflower" | etc. */
  readonly plant_status?: string | null;
  /** Last grower log timestamp (any log type). */
  readonly last_log_at?: string | number | Date | null;
  readonly recent_action_count_48h: number;
  readonly recent_major_change_count_48h: number;
  readonly active_alert_count: number;
  readonly sensor_source_summary: StabilizeSensorSourceSummary;
  readonly has_stale_or_invalid_sensor_data: boolean;
  readonly has_demo_or_manual_only_sensor_data: boolean;
  readonly ai_doctor_confidence_level?: StabilizeAiConfidence;
  readonly ai_doctor_missing_info_count?: number;
  readonly notes?: string | null;
}

export interface StabilizeModeResult {
  readonly level: StabilizeModeLevel;
  readonly headline: string;
  readonly one_thing_to_watch: string;
  readonly why_now: readonly string[];
  readonly what_not_to_do: readonly string[];
  readonly safe_next_log_prompt: string;
  readonly recommended_wait_period: string;
  readonly confidence: StabilizeModeConfidence;
  readonly evidence: readonly string[];
  readonly limitations: readonly string[];
  /** Always review-only. Never auto-creates Action Queue items. */
  readonly action_queue_policy: "none" | "review_only";
  readonly safety_flags: readonly string[];
}

const SAFE_NEXT_LOG_PROMPT_DEFAULT =
  "Log one observation: better, same, or worse. Add a photo or voice note if possible.";

const STACKED_CHANGES_WARNING =
  "Avoid stacking more changes until you can observe the plant response.";
const SENSOR_NOT_LIVE_WARNING =
  "Do not treat current telemetry as live proof.";
const LOW_AI_CONFIDENCE_WARNING =
  "Do not overdiagnose from weak context.";
const AUTOFLOWER_LOW_STRESS_WARNING =
  "Avoid heavy defoliation, transplant, or high-stress training right now.";
const NUTRIENT_RESTRAINT_WARNING =
  "Do not chase nutrient or pH changes from weak evidence.";
const DEVICE_RESTRAINT_WARNING =
  "Do not change equipment setpoints based on this card.";

const HOUR_MS = 60 * 60 * 1000;

function toMs(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function safeInt(n: number | undefined | null): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function isRecoveringStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return (
    s.includes("recover") ||
    s.includes("stress") ||
    s.includes("sick") ||
    s.includes("damage")
  );
}

function isAutoflowerLike(
  stage: string | null | undefined,
  status: string | null | undefined,
): boolean {
  const blob = `${stage ?? ""} ${status ?? ""}`.toLowerCase();
  return blob.includes("auto");
}

/**
 * Derive Stabilize Mode guidance from local context.
 * Deterministic; safe to call repeatedly with same input.
 */
export function evaluateStabilizeMode(
  input: StabilizeModeInput,
): StabilizeModeResult {
  const nowMs = toMs(input.now) ?? 0;
  const lastLogMs = toMs(input.last_log_at ?? null);

  const actions = safeInt(input.recent_action_count_48h);
  const majors = safeInt(input.recent_major_change_count_48h);
  const alerts = safeInt(input.active_alert_count);
  const missingInfo = safeInt(input.ai_doctor_missing_info_count);
  const ai = input.ai_doctor_confidence_level ?? "unknown";

  const hoursSinceLastLog =
    lastLogMs !== null && nowMs > 0
      ? Math.max(0, (nowMs - lastLogMs) / HOUR_MS)
      : null;

  const missingLogs = hoursSinceLastLog === null || hoursSinceLastLog >= 36;
  const staleOrInvalid = !!input.has_stale_or_invalid_sensor_data;
  const demoOrManualOnly = !!input.has_demo_or_manual_only_sensor_data;
  const sensorSrc = input.sensor_source_summary;
  const sensorWeak =
    staleOrInvalid ||
    demoOrManualOnly ||
    sensorSrc === "demo" ||
    sensorSrc === "manual" ||
    sensorSrc === "stale" ||
    sensorSrc === "invalid" ||
    sensorSrc === "none";
  const aiWeak = ai === "low" || ai === "unknown" || missingInfo >= 2;
  const recovering = isRecoveringStatus(input.plant_status);
  const autoflowerLike = isAutoflowerLike(input.plant_stage, input.plant_status);

  const evidence: string[] = [];
  evidence.push(`recent_actions_48h=${actions}`);
  evidence.push(`recent_major_changes_48h=${majors}`);
  evidence.push(`active_alerts=${alerts}`);
  evidence.push(`sensor_source_summary=${sensorSrc}`);
  evidence.push(`has_stale_or_invalid_sensor_data=${staleOrInvalid}`);
  evidence.push(`has_demo_or_manual_only_sensor_data=${demoOrManualOnly}`);
  evidence.push(`ai_doctor_confidence=${ai}`);
  evidence.push(`ai_doctor_missing_info=${missingInfo}`);
  evidence.push(
    `hours_since_last_log=${
      hoursSinceLastLog === null ? "unknown" : hoursSinceLastLog.toFixed(1)
    }`,
  );
  if (input.plant_stage) evidence.push(`plant_stage=${input.plant_stage}`);
  if (input.plant_status) evidence.push(`plant_status=${input.plant_status}`);

  // ----- Level selection (deterministic order) -----
  let level: StabilizeModeLevel = "off";
  const why: string[] = [];

  const highAlerts = alerts >= 2;
  const anyAlerts = alerts >= 1;
  const stackedActions = actions >= 3;
  const stackedMajors = majors >= 2;
  const problemPeriod = anyAlerts || stackedActions || stackedMajors;

  if (highAlerts && (sensorWeak || aiWeak || stackedMajors || stackedActions)) {
    level = "urgent_review";
    why.push("Multiple active alerts during a reactive period.");
  } else if (
    stackedActions ||
    stackedMajors ||
    (anyAlerts && (aiWeak || staleOrInvalid)) ||
    (staleOrInvalid && problemPeriod)
  ) {
    level = "stabilize";
    if (stackedActions) why.push("Three or more actions in the last 48 hours.");
    if (stackedMajors)
      why.push("Two or more major changes in the last 48 hours.");
    if (anyAlerts && aiWeak)
      why.push("Active alert with weak or missing context.");
    if (staleOrInvalid && problemPeriod)
      why.push("Stale or invalid sensor data during a problem period.");
  } else if (
    missingLogs ||
    demoOrManualOnly ||
    staleOrInvalid ||
    sensorSrc === "demo" ||
    sensorSrc === "manual" ||
    sensorSrc === "none" ||
    aiWeak ||
    anyAlerts
  ) {
    level = "watch";
    if (missingLogs) why.push("No recent grower log in the last day or two.");
    if (demoOrManualOnly)
      why.push("Sensor context is demo or manual-only, not live.");
    if (staleOrInvalid)
      why.push("Sensor readings look stale or invalid.");
    if (aiWeak) why.push("AI Doctor context is weak or incomplete.");
    if (anyAlerts) why.push("There is an active alert to review.");
  } else {
    level = "off";
    why.push("Recent activity is calm and context looks clean.");
  }

  // ----- What-not-to-do (always populated for non-off) -----
  const notTodo: string[] = [];
  if (level !== "off") {
    notTodo.push(DEVICE_RESTRAINT_WARNING);
    notTodo.push(NUTRIENT_RESTRAINT_WARNING);
    if (stackedActions || stackedMajors)
      notTodo.push(STACKED_CHANGES_WARNING);
    if (sensorWeak) notTodo.push(SENSOR_NOT_LIVE_WARNING);
    if (aiWeak) notTodo.push(LOW_AI_CONFIDENCE_WARNING);
    if (autoflowerLike || recovering)
      notTodo.push(AUTOFLOWER_LOW_STRESS_WARNING);
  }

  // ----- Safe next log prompt -----
  let safePrompt = SAFE_NEXT_LOG_PROMPT_DEFAULT;
  if (level === "urgent_review") {
    safePrompt =
      "Log one calm observation now: photo, what changed, and how the plant looks. Do not change equipment.";
  } else if (level === "stabilize") {
    safePrompt =
      "Pause changes. Log one observation: better, same, or worse, with a photo if possible.";
  }

  // ----- Headline + watch focus -----
  let headline: string;
  let watch: string;
  let wait: string;
  switch (level) {
    case "off":
      headline = "All clear — keep logging as usual.";
      watch = "Continue your normal daily observation.";
      wait = "Next normal check-in.";
      break;
    case "watch":
      headline = "Soft watch — capture one clean observation.";
      watch = "Plant response since your last action or alert.";
      wait = "Re-check in 12 to 24 hours.";
      break;
    case "stabilize":
      headline = "Stabilize mode — pause changes and observe.";
      watch =
        "How the plant responds to changes already made in the last 48 hours.";
      wait = "Hold changes for 24 to 48 hours before adjusting anything else.";
      break;
    case "urgent_review":
      headline = "Urgent review — slow down and confirm context.";
      watch =
        "Confirm the active alert with a fresh photo and one calm observation.";
      wait =
        "Do not stack more changes. Re-evaluate after the next clean observation.";
      break;
  }

  // ----- Confidence -----
  let confidence: StabilizeModeConfidence = "medium";
  if (sensorWeak && aiWeak) confidence = "low";
  else if (!sensorWeak && (ai === "high" || ai === "medium"))
    confidence = "high";

  const limitations: string[] = [];
  if (sensorWeak)
    limitations.push("Sensor context is not verified live.");
  if (aiWeak) limitations.push("AI Doctor context is weak or unknown.");
  if (hoursSinceLastLog === null)
    limitations.push("No recent grower log timestamp available.");

  const safety_flags: string[] = [
    "no_device_control",
    "no_automation",
    "approval_required_for_actions",
    "read_only_advisory",
  ];
  if (level !== "off") safety_flags.push("avoid_aggressive_intervention");
  if (autoflowerLike || recovering)
    safety_flags.push("prefer_low_stress_path");

  return Object.freeze({
    level,
    headline,
    one_thing_to_watch: watch,
    why_now: Object.freeze(why.slice()),
    what_not_to_do: Object.freeze(notTodo.slice()),
    safe_next_log_prompt: safePrompt,
    recommended_wait_period: wait,
    confidence,
    evidence: Object.freeze(evidence.slice()),
    limitations: Object.freeze(limitations.slice()),
    action_queue_policy: "review_only",
    safety_flags: Object.freeze(safety_flags.slice()),
  }) as StabilizeModeResult;
}
